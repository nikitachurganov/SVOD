"""The paid launch: the pre-flight check, the switch from shadow mode and the first numbers.

Everything here reads, except ``reset_response_counters``. The operator runs it from the command line
(``python -m app.billing_cli preflight`` and friends), see docs/LAUNCH_CHECKLIST.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.roles import ROLE_ADMIN
from app.core.config import settings
from app.repositories import admin_repository, launch_repository, plan_request_repository
from app.services import email_service

OK, WARN, FAIL = "ok", "warn", "fail"

DEFAULT_SECRET = "change-me"
MIN_SECRET_LENGTH = 32
# A payment open this long is not a person still typing a card number
STUCK_PAYMENT_AFTER = timedelta(hours=1)


@dataclass(frozen=True)
class Check:
    level: str
    name: str
    detail: str


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _settings_checks() -> list[Check]:
    checks: list[Check] = []

    if settings.BILLING_ENABLED:
        checks.append(Check(OK, "Тарифы включены", "BILLING_ENABLED=true"))
    else:
        checks.append(
            Check(FAIL, "Тарифы выключены", "BILLING_ENABLED=false: лимитов нет, подписки не считаются")
        )

    secret = settings.SECRET_KEY
    if secret == DEFAULT_SECRET or len(secret) < MIN_SECRET_LENGTH:
        checks.append(
            Check(
                FAIL,
                "Слабый SECRET_KEY",
                f"по умолчанию или короче {MIN_SECRET_LENGTH} символов: токены можно подделать",
            )
        )
    else:
        checks.append(Check(OK, "SECRET_KEY", "задан"))

    if email_service.is_configured():
        checks.append(Check(OK, "Почта", "SMTP настроен: письма о тарифах, подтверждение почты и сброс пароля уходят"))
    else:
        checks.append(
            Check(
                WARN,
                "Почта не настроена",
                "SMTP_HOST пуст: почта не подтверждается, напоминания о тарифе и оповещения не уходят",
            )
        )

    public_url = settings.SURVEYS_APP_PUBLIC_URL.strip() or settings.APP_PUBLIC_URL.strip()
    if not public_url or "localhost" in public_url:
        checks.append(
            Check(WARN, "Публичный адрес", f"«{public_url or 'пусто'}»: ссылки в письмах будут вести не туда")
        )
    else:
        checks.append(Check(OK, "Публичный адрес", public_url))

    if settings.ADMIN_NOTIFY_EMAIL.strip():
        checks.append(Check(OK, "Почта администратора", "ADMIN_NOTIFY_EMAIL задан: заявки и оповещения придут"))
    else:
        checks.append(
            Check(WARN, "Почта администратора", "ADMIN_NOTIFY_EMAIL пуст: заявки и оповещения о сбоях никто не получит")
        )

    if settings.AI_DAILY_BUDGET_USD > 0:
        checks.append(Check(OK, "Потолок расходов на ИИ", f"{settings.AI_DAILY_BUDGET_USD:g} $ за сутки"))
    else:
        checks.append(
            Check(
                WARN,
                "Нет потолка расходов на ИИ",
                "AI_DAILY_BUDGET_USD=0: защиты от неожиданного счёта на уровне сервиса нет",
            )
        )

    if settings.OPENROUTER_MANAGEMENT_KEY.strip():
        checks.append(Check(OK, "Баланс OpenRouter", f"отслеживается, порог {settings.OPENROUTER_LOW_BALANCE_USD:g} $"))
    else:
        checks.append(
            Check(
                WARN,
                "Баланс OpenRouter не отслеживается",
                "нет OPENROUTER_MANAGEMENT_KEY: когда кредиты кончатся, ИИ встанет у всех сразу без предупреждения",
            )
        )

    if settings.payments_enabled:
        detail = "оплата включена"
        if not settings.YOOKASSA_VERIFY_WEBHOOK_IP:
            detail += "; проверка адреса уведомлений выключена (платёж всё равно проверяется через API)"
        checks.append(Check(OK, "Онлайн-оплата (ЮKassa)", detail))
    else:
        checks.append(
            Check(
                WARN,
                "Онлайн-оплата не подключена",
                "нет ключей ЮKassa: доступна только заявка на счёт, подключать тарифы придётся вручную",
            )
        )
    return checks


async def preflight(
    session: AsyncSession, *, head_revision: str | None = None, now: datetime | None = None
) -> list[Check]:
    """Everything that should be true before the limits start to block people."""
    now = now or _now()
    checks = _settings_checks()

    admins = await launch_repository.count_active_admins(session, ROLE_ADMIN)
    if admins:
        checks.append(Check(OK, "Администраторы", f"активных: {admins}"))
    else:
        checks.append(
            Check(FAIL, "Нет администратора", "назначьте: python -m app.billing_cli make-admin почта")
        )

    revision = await launch_repository.current_revision(session)
    if head_revision is None:
        checks.append(Check(WARN, "Миграции", f"версия БД {revision or 'неизвестна'}, актуальную определить не удалось"))
    elif revision == head_revision:
        checks.append(Check(OK, "Миграции", f"БД на актуальной версии {revision}"))
    else:
        checks.append(
            Check(FAIL, "Миграции", f"БД на {revision or 'неизвестной'}, нужна {head_revision}: примените alembic upgrade head")
        )

    rows, counted = await launch_repository.response_counters(session)
    if settings.BILLING_ENFORCE:
        checks.append(Check(OK, "Лимиты блокируют", "BILLING_ENFORCE=true"))
    elif counted:
        checks.append(
            Check(
                WARN,
                "Счётчик ответов накопился в теневом режиме",
                f"{counted} ответов в {rows} счётчиках. Перед включением лимитов обнулите: "
                "python -m app.billing_cli reset-response-counters, иначе новые ответы сразу уйдут под замок",
            )
        )
    else:
        checks.append(Check(OK, "Теневой режим", "лимиты считаются и ничего не блокируют; счётчик ответов пуст"))

    users = await launch_repository.count_users(session)
    tiers = await admin_repository.tier_totals(session, now, settings.BILLING_PAST_DUE_GRACE_DAYS)
    paying = tiers[admin_repository.TIER_PAID] + tiers[admin_repository.TIER_TRIAL]
    if users and not paying and not settings.BILLING_ENFORCE:
        checks.append(
            Check(
                WARN,
                "Никто не на платном тарифе",
                f"пользователей {users}: после включения лимитов все окажутся на «Старте». "
                "Бета-доступ: python -m app.billing_cli grant-beta --until ГГГГ-ММ-ДД --dry-run",
            )
        )
    else:
        checks.append(Check(OK, "Платные тарифы", f"платных {tiers[admin_repository.TIER_PAID]}, пробных {tiers[admin_repository.TIER_TRIAL]}, бесплатных {tiers[admin_repository.TIER_FREE]}"))

    pending = await plan_request_repository.count_pending(session)
    if pending:
        checks.append(Check(WARN, "Заявки на тариф", f"ждут решения: {pending}"))

    locked = await launch_repository.count_locked_responses(session)
    if locked:
        checks.append(Check(WARN, "Скрытые ответы", f"сверх квоты скрыто: {locked} (откроет повышение тарифа)"))

    stuck = await launch_repository.count_open_payments(session, older_than=now - STUCK_PAYMENT_AFTER)
    if stuck:
        checks.append(Check(WARN, "Платежи без итога", f"висят больше часа: {stuck}. Проверьте их в кабинете ЮKassa"))
    return checks


def format_checks(checks: list[Check]) -> str:
    marks = {OK: "[ OK ]", WARN: "[WARN]", FAIL: "[FAIL]"}
    lines = [f"{marks[check.level]} {check.name}: {check.detail}" for check in checks]
    failed = sum(1 for check in checks if check.level == FAIL)
    warned = sum(1 for check in checks if check.level == WARN)
    lines.append("")
    lines.append(
        "Запускать нельзя: есть критичные замечания." if failed else
        f"Критичных замечаний нет. Предупреждений: {warned}."
    )
    return "\n".join(lines)


def has_failures(checks: list[Check]) -> bool:
    return any(check.level == FAIL for check in checks)


async def reset_response_counters(session: AsyncSession, *, dry_run: bool) -> tuple[int, int]:
    """Zero the response counters that shadow mode kept (no commit). Returns (counters, responses).

    Without it, the period's responses already counted would stand against the quota the moment the
    limits are switched on, and new answers would be locked at once.
    """
    rows, counted = await launch_repository.response_counters(session)
    if rows and not dry_run:
        await launch_repository.delete_response_counters(session)
    return rows, counted


def _share(part: int, whole: int) -> str:
    return f"{part * 100 / whole:.0f} %" if whole else "—"


async def funnel(
    session: AsyncSession, *, days: int, now: datetime | None = None
) -> tuple[dict[str, int], str]:
    """The people who registered in the last ``days`` days and how far they got."""
    now = now or _now()
    counts = await launch_repository.funnel(
        session,
        since=now - timedelta(days=days),
        now=now,
        grace_days=settings.BILLING_PAST_DUE_GRACE_DAYS,
    )
    registered = counts["registered"]
    rows = [
        ("Зарегистрировались", "registered"),
        ("Подтвердили почту", "email_verified"),
        ("Создали опрос", "created_survey"),
        ("Получили ответ", "got_response"),
        ("Запускали пробный период", "used_trial"),
        ("Платили онлайн", "paid_online"),
        ("Сейчас на платном тарифе", "on_paid_plan"),
    ]
    lines = [f"Зарегистрировались за {days} дн.; доли от них:"]
    for title, key in rows:
        lines.append(f"  {title}: {counts[key]} ({_share(counts[key], registered)})")
    return counts, "\n".join(lines)
