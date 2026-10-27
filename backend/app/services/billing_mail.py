"""The emails of the subscription's life: what happened to the plan, what is about to, what to do.

The wording lives here and nowhere else. Every function returns whether the email was sent and
never raises; the callers decide what an unsent email means (see subscription_lifecycle_service).
Links lead to the profile page of the surveys service, to the "Подписка" tab.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.services import email_service

_TAB = "/profile?tab=subscription"


def _base_url() -> str:
    return (settings.SURVEYS_APP_PUBLIC_URL.strip() or settings.APP_PUBLIC_URL.strip()).rstrip("/")


def _subscription_url() -> str:
    return f"{_base_url()}{_TAB}"


def _date(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%d.%m.%Y")


def _surveys_closed(count: int) -> list[str]:
    if count <= 0:
        return []
    return [
        f"Тариф «Старт» позволяет держать открытыми не больше трёх опросов, поэтому мы закрыли "
        f"для сбора ответов опросов: {count}. Открытыми остались самые активные. Ничего не удалено: "
        "закрытый опрос можно открыть снова."
    ]


async def send_trial_ending(user: Any, ends_at: datetime) -> bool:
    return await email_service.send_notice(
        to=user.email,
        first_name=user.first_name,
        subject="Пробный период заканчивается — СВОД",
        paragraphs=[
            f"Пробный период тарифа «Исследователь» заканчивается {_date(ends_at)}.",
            "После этого вы вернётесь на тариф «Старт»: лимиты станут меньше, а часть функций "
            "(кросстабы, выгрузка в CSV, все методики) закроется. Ваши опросы и ответы сохранятся.",
            "Чтобы остаться на «Исследователе», оформите подписку.",
        ],
        action_label="Выбрать тариф",
        action_url=_subscription_url(),
    )


async def send_trial_ended(user: Any, closed_surveys: int = 0) -> bool:
    return await email_service.send_notice(
        to=user.email,
        first_name=user.first_name,
        subject="Пробный период закончился — СВОД",
        paragraphs=[
            "Пробный период тарифа «Исследователь» закончился, вы на тарифе «Старт».",
            *_surveys_closed(closed_surveys),
            "Опросы и собранные ответы сохранены. Вернуть все возможности можно в любой момент.",
        ],
        action_label="Выбрать тариф",
        action_url=_subscription_url(),
    )


async def send_plan_ending(user: Any, plan_title: str, ends_at: datetime) -> bool:
    return await email_service.send_notice(
        to=user.email,
        first_name=user.first_name,
        subject="Тариф скоро закончится — СВОД",
        paragraphs=[
            f"Тариф «{plan_title}» действует до {_date(ends_at)}.",
            "После этой даты вы перейдёте на тариф «Старт». Опросы и ответы сохранятся, но лимиты "
            "станут меньше. Чтобы продлить тариф, оформите подписку.",
        ],
        action_label="Продлить тариф",
        action_url=_subscription_url(),
    )


async def send_plan_ended(user: Any, plan_title: str, closed_surveys: int = 0) -> bool:
    return await email_service.send_notice(
        to=user.email,
        first_name=user.first_name,
        subject="Тариф закончился — СВОД",
        paragraphs=[
            f"Тариф «{plan_title}» закончился, вы перешли на тариф «Старт».",
            *_surveys_closed(closed_surveys),
            "Опросы и собранные ответы хранятся у нас, их можно вернуть повторным подключением тарифа.",
        ],
        action_label="Выбрать тариф",
        action_url=_subscription_url(),
    )


_LIMIT_WORDS = {
    "ai_actions": (
        "ИИ-действий",
        "кнопки ИИ перестанут работать до начала следующего периода или повышения тарифа.",
    ),
    "responses": (
        "ответов",
        "новые ответы продолжат приходить и сохраняться, но не попадут в результаты и анализ, "
        "пока вы не повысите тариф. Респондентам это незаметно.",
    ),
}


async def send_limit_warning(user: Any, metric: str, used: int, limit: int) -> bool:
    what, consequence = _LIMIT_WORDS.get(metric, ("единиц лимита", "часть функций станет недоступна."))
    return await email_service.send_notice(
        to=user.email,
        first_name=user.first_name,
        subject="Лимит тарифа почти исчерпан — СВОД",
        paragraphs=[
            f"В текущем периоде вы использовали {used} из {limit} {what}.",
            f"Когда лимит закончится, {consequence}",
        ],
        action_label="Посмотреть тарифы",
        action_url=_subscription_url(),
    )


async def send_deletion_reminder(user: Any, delete_at: datetime, days_left: int) -> bool:
    when = "завтра" if days_left <= 1 else f"через {days_left} дн."
    return await email_service.send_notice(
        to=user.email,
        first_name=user.first_name,
        subject="Аккаунт будет удалён — СВОД",
        paragraphs=[
            f"По вашей просьбе аккаунт будет удалён {when}, {_date(delete_at)}, когда закончится "
            "оплаченный период. Вместе с ним удалятся опросы и все собранные ответы.",
            "Если вы передумали, отмените удаление: аккаунт останется как есть.",
        ],
        action_label="Отменить удаление",
        action_url=_subscription_url(),
    )


async def send_account_deleted(email: str, first_name: str) -> bool:
    return await email_service.send_notice(
        to=email,
        first_name=first_name,
        subject="Аккаунт удалён — СВОД",
        paragraphs=[
            "Как вы просили, мы удалили ваш аккаунт в СВОД вместе с опросами и собранными ответами.",
            "Спасибо, что пользовались сервисом.",
        ],
    )


async def send_deletion_blocked(user: Any, organization_names: list[str]) -> bool:
    names = ", ".join(f"«{name}»" for name in organization_names)
    return await email_service.send_notice(
        to=user.email,
        first_name=user.first_name,
        subject="Не удалось удалить аккаунт — СВОД",
        paragraphs=[
            "Оплаченный период закончился, но удалить аккаунт мы не смогли: вы владелец организаций, "
            f"где работают другие люди: {names}.",
            "Передайте владение или удалите эти организации, затем повторите удаление аккаунта. "
            "До тех пор аккаунт остаётся активным.",
        ],
        action_label="Открыть профиль",
        action_url=f"{_base_url()}/profile",
    )


async def send_plan_request_to_admin(
    *, to: str, person: str, email: str, plan_title: str, interval: str, contact: str, comment: str | None
) -> bool:
    """Tell the administrator that someone asked for a plan."""
    paragraphs = [
        f"Заявка на тариф «{plan_title}» ({interval}) от {person}, {email}.",
        f"Как связаться: {contact}.",
    ]
    if comment:
        paragraphs.append(f"Комментарий: {comment}")
    return await email_service.send_notice(
        to=to,
        first_name="администратор",
        subject="Заявка на тариф — СВОД",
        paragraphs=paragraphs,
        action_label="Открыть заявки",
        action_url=f"{_base_url()}/admin?tab=requests",
    )


async def send_payment_alert_to_admin(
    *,
    to: str,
    outcome: str,
    payment_id: str,
    email: str,
    amount_kopecks: int,
    refunded_kopecks: int,
) -> bool:
    """A payment needs a human: money went back (the plan stays until it is taken away by hand) or
    the provider's amount differs from ours (nothing was granted)."""
    rub = amount_kopecks / 100
    if outcome == "refunded":
        subject = "Возврат по платежу — СВОД"
        paragraphs = [
            f"По платежу {payment_id} от {email} на {rub:g} ₽ возвращено {refunded_kopecks / 100:g} ₽.",
            "Тариф человека остаётся. Если он больше не положен, снимите его в карточке пользователя.",
        ]
    else:
        subject = "Платёж с другой суммой — СВОД"
        paragraphs = [
            f"По платежу {payment_id} от {email} сумма у платёжного сервиса не совпала с ожидаемой ({rub:g} ₽).",
            "Тариф не выдан. Проверьте платёж в личном кабинете ЮKassa.",
        ]
    return await email_service.send_notice(
        to=to,
        first_name="администратор",
        subject=subject,
        paragraphs=paragraphs,
        action_label="Открыть администрирование",
        action_url=f"{_base_url()}/admin",
    )


async def send_ops_alert(*, to: str, subject: str, lines: list[str]) -> bool:
    """Something in the running service needs the operator: the AI fails, money stalls, credit runs out."""
    return await email_service.send_notice(
        to=to,
        first_name="администратор",
        subject=f"{subject} — СВОД",
        paragraphs=lines,
        action_label="Открыть администрирование",
        action_url=f"{_base_url()}/admin",
    )


async def send_plan_granted(user: Any, plan_title: str, ends_at: datetime) -> bool:
    return await email_service.send_notice(
        to=user.email,
        first_name=user.first_name,
        subject="Тариф подключён — СВОД",
        paragraphs=[
            f"Тариф «{plan_title}» подключён и действует до {_date(ends_at)}.",
            "Все возможности тарифа уже доступны. Если часть ответов ждала увеличения лимита, "
            "они стали видны.",
        ],
        action_label="Открыть подписку",
        action_url=_subscription_url(),
    )


async def send_plan_request_rejected(user: Any, reason: str | None) -> bool:
    paragraphs = ["К сожалению, мы не смогли подключить тариф по вашей заявке."]
    if reason:
        paragraphs.append(f"Причина: {reason}")
    paragraphs.append("Если это ошибка, ответьте на это письмо или отправьте заявку ещё раз.")
    return await email_service.send_notice(
        to=user.email,
        first_name=user.first_name,
        subject="Заявка на тариф — СВОД",
        paragraphs=paragraphs,
        action_label="Открыть подписку",
        action_url=_subscription_url(),
    )
