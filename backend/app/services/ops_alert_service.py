"""Alerts about the running service, sent by the worker.

The repository has no Prometheus or Alertmanager, so the things that stop the paid service quietly are
watched here: the AI that fails for everybody (the proxy or OpenRouter is down), the AI spending cap and
the OpenRouter credit that run out, payments that fail or hang. Each alert goes to ADMIN_NOTIFY_EMAIL, at
most once per cooldown, and is always written to the log as an ERROR so a log watcher sees it too.

The cooldown lives in the worker's memory: a restart may repeat an alert, which is better than losing one.
A dead worker cannot report itself, so the worker and the API need an outside uptime check
(docs/LAUNCH_CHECKLIST.md).
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.repositories import billing_repository, launch_repository
from app.services import billing_mail, email_service
from app.services import subscription_lifecycle_service as lifecycle

logger = logging.getLogger(__name__)

AI_WINDOW = timedelta(minutes=30)
AI_MIN_CALLS = 10
AI_FAILED_SHARE = 0.5
BUDGET_WARN_SHARE = 0.8
PAYMENT_WINDOW = timedelta(hours=1)
PAYMENTS_FAILED_LIMIT = 3
BALANCE_CHECK_EVERY = timedelta(minutes=30)
CREDITS_URL = "https://openrouter.ai/api/v1/credits"

ALERT_AI_FAILING = "ai_failing"
ALERT_BUDGET_HIT = "ai_daily_budget_hit"
ALERT_BUDGET_NEAR = "ai_daily_budget_near"
ALERT_PAYMENTS_FAILING = "payments_failing"
ALERT_PAYMENTS_STUCK = "payments_stuck"
ALERT_BALANCE_LOW = "openrouter_balance_low"


@dataclass(frozen=True)
class Alert:
    key: str
    subject: str
    lines: list[str]


_last_sent: dict[str, datetime] = {}
_balance_checked_at: datetime | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _ai_alerts(session: AsyncSession, now: datetime) -> list[Alert]:
    total, failed = await launch_repository.ai_outcomes_since(session, now - AI_WINDOW)
    if total >= AI_MIN_CALLS and failed / total >= AI_FAILED_SHARE:
        return [
            Alert(
                ALERT_AI_FAILING,
                "ИИ не отвечает",
                [
                    f"За последние {int(AI_WINDOW.total_seconds() // 60)} минут ИИ-действий: {total}, "
                    f"из них закончились ошибкой: {failed}.",
                    "Похоже, недоступен прокси или OpenRouter, либо закончились кредиты. "
                    "Люди видят ошибку и тратят действия: проверьте `dc logs api` и баланс OpenRouter.",
                ],
            )
        ]
    return []


async def _budget_alerts(session: AsyncSession, now: datetime) -> list[Alert]:
    cap = settings.AI_DAILY_BUDGET_USD
    if cap <= 0:
        return []
    spent = float(await billing_repository.sum_ai_cost_usd(session, since=now - timedelta(hours=24)))
    if spent >= cap:
        return [
            Alert(
                ALERT_BUDGET_HIT,
                "Суточный потолок расходов на ИИ исчерпан",
                [
                    f"За сутки потрачено {spent:.2f} $ из {cap:g} $. ИИ отвечает людям «временно недоступен», "
                    "пока расход не опустится ниже потолка.",
                    "Если это всплеск пользователей, а не злоупотребление, поднимите AI_DAILY_BUDGET_USD.",
                ],
            )
        ]
    if spent >= cap * BUDGET_WARN_SHARE:
        return [
            Alert(
                ALERT_BUDGET_NEAR,
                "Расход на ИИ близок к суточному потолку",
                [f"За сутки потрачено {spent:.2f} $ из {cap:g} $ ({spent * 100 / cap:.0f} %)."],
            )
        ]
    return []


async def _payment_alerts(session: AsyncSession, now: datetime) -> list[Alert]:
    if not settings.payments_enabled:
        return []
    alerts: list[Alert] = []
    failed = await launch_repository.count_failed_payments(session, since=now - PAYMENT_WINDOW)
    if failed >= PAYMENTS_FAILED_LIMIT:
        alerts.append(
            Alert(
                ALERT_PAYMENTS_FAILING,
                "Платежи не создаются",
                [
                    f"За последний час людям не удалось начать оплату {failed} раз(а): ЮKassa недоступна "
                    "или отклоняет запросы.",
                    "Проверьте ключи магазина и `dc logs api` (строки «YooKassa refused» и «YooKassa is unavailable»).",
                ],
            )
        )
    stuck = await launch_repository.count_open_payments(session, older_than=now - PAYMENT_WINDOW)
    if stuck:
        alerts.append(
            Alert(
                ALERT_PAYMENTS_STUCK,
                "Платежи без итога",
                [
                    f"Платежей, по которым ЮKassa не дала итога больше часа: {stuck}.",
                    "Человек мог заплатить без тарифа. Найдите их в карточках пользователей (вкладка «Платежи») "
                    "и в кабинете ЮKassa.",
                ],
            )
        )
    return alerts


async def fetch_openrouter_balance() -> float:
    """Remaining OpenRouter credit in dollars; needs a management key."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            CREDITS_URL,
            headers={"Authorization": f"Bearer {settings.OPENROUTER_MANAGEMENT_KEY.strip()}"},
        )
    response.raise_for_status()
    data = response.json()["data"]
    return float(data["total_credits"]) - float(data["total_usage"])


async def _balance_alerts(now: datetime) -> list[Alert]:
    global _balance_checked_at
    if not settings.OPENROUTER_MANAGEMENT_KEY.strip():
        return []
    if _balance_checked_at is not None and now - _balance_checked_at < BALANCE_CHECK_EVERY:
        return []
    _balance_checked_at = now
    try:
        remaining = await fetch_openrouter_balance()
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
        logger.warning("Could not read the OpenRouter balance: %s", exc.__class__.__name__)
        return []
    if remaining < settings.OPENROUTER_LOW_BALANCE_USD:
        return [
            Alert(
                ALERT_BALANCE_LOW,
                "Кредиты OpenRouter заканчиваются",
                [
                    f"Осталось {remaining:.2f} $ (порог {settings.OPENROUTER_LOW_BALANCE_USD:g} $).",
                    "Когда кредиты кончатся, ИИ перестанет работать у всех сразу. Пополните баланс.",
                ],
            )
        ]
    return []


async def collect(session: AsyncSession, now: datetime | None = None) -> list[Alert]:
    now = now or _now()
    return [
        *await _ai_alerts(session, now),
        *await _budget_alerts(session, now),
        *await _payment_alerts(session, now),
        *await _balance_alerts(now),
    ]


def _cooling_down(key: str, now: datetime) -> bool:
    last = _last_sent.get(key)
    return last is not None and now - last < timedelta(minutes=settings.OPS_ALERT_COOLDOWN_MINUTES)


async def deliver(alerts: list[Alert], now: datetime | None = None) -> list[str]:
    """Send what is not on cooldown. Returns the keys that were raised. Never raises."""
    now = now or _now()
    raised: list[str] = []
    to = settings.ADMIN_NOTIFY_EMAIL.strip()
    for alert in alerts:
        if _cooling_down(alert.key, now):
            continue
        # The log line is the alert for anyone who watches logs instead of mail
        logger.error("Ops alert [%s] %s: %s", alert.key, alert.subject, " ".join(alert.lines))
        _last_sent[alert.key] = now
        raised.append(alert.key)
        if to and email_service.is_configured():
            await lifecycle.deliver(billing_mail.send_ops_alert(to=to, subject=alert.subject, lines=alert.lines))
    return raised


async def run(session: AsyncSession, now: datetime | None = None) -> Counter[str]:
    """The worker step."""
    now = now or _now()
    raised = await deliver(await collect(session, now), now)
    # collect() only reads; do not leave its transaction open
    await session.rollback()
    return Counter(raised)
