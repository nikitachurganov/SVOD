"""Bot UI strings (Russian) and message formatting."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from aiogram import html
from fastapi import HTTPException

from app.core.config import settings
from app.services.request_draft_ai_service import ATTACHMENTS_FIELD_ID
from app.models.notification import Notification
from app.models.request import Request
from app.models.telegram import TelegramRequestSuggestion

HELP = (
    "<b>СВОД в Telegram</b>\n\n"
    "Сюда приходят уведомления по вашим заявкам: новые заявки, назначения, этапы, смена статуса.\n\n"
    "/new — создать заявку: опишите задачу, бот подберёт форму и заполнит поля\n"
    "/my — мои активные заявки\n"
    "/free — свободные заявки организации\n"
    "/org — выбрать организацию\n"
    "/start — статус подключения\n"
    "/help — эта справка"
)

NOT_LINKED = (
    "Аккаунт СВОД не подключён. Откройте СВОД → меню профиля → «Telegram» и перейдите по ссылке."
)
LINK_INVALID = "Ссылка недействительна или устарела. Получите новую в СВОД: меню профиля → «Telegram»."
ASK_STAGE_RESULT = (
    "Опишите результат этапа одним сообщением — итог, ссылка на материалы.\n"
    "/cancel — отменить"
)
STAGE_RESULT_EMPTY = "Нужен текст результата. Отправьте описание или /cancel."
CANCELLED = "Отменено."
NO_ORGANIZATIONS = "Вы не состоите ни в одной организации СВОД."
CHOOSE_ORGANIZATION = "Выберите организацию:"
ASK_NEW_REQUEST = (
    "Опишите задачу одним сообщением: что нужно сделать, сроки, детали.\n"
    "Можно приложить фото или документ с подписью. /cancel — отменить"
)
NEW_REQUEST_EMPTY = "Нужно текстовое описание задачи. Отправьте его или /cancel."
DRAFT_IN_PROGRESS = "⏳ Готовлю черновик заявки…"
ASK_SUGGESTION_EDIT = (
    "Отправьте исправленный текст: первая строка — заголовок, дальше — описание.\n"
    "/cancel — оставить как есть"
)
CHOOSE_FORM = "Выберите форму — поля заполнятся заново:"
NO_REQUESTS = "Заявок нет."

GROUP_NOT_LINKED = (
    "Сначала подключите свой аккаунт СВОД к боту: СВОД → меню профиля → «Telegram»."
)
GROUP_ONLY_OWNER = "Подключить группу может только владелец организации в СВОД."
GROUP_NOT_CONNECTED = "Группа не подключена к СВОД. Владелец организации может подключить её командой /connect."
GROUP_DISCONNECTED = "Группа отключена от СВОД, сохранённые сообщения удалены."
GROUP_PAUSED = "⏸ Автоматический поиск заявок остановлен. /request по-прежнему работает, /resume — включить снова."
GROUP_RESUMED = "▶️ Снова ищу заявки в переписке."
GROUP_NOTHING_TO_ANALYZE = (
    "Не вижу сообщений для заявки. Ответьте командой /request на сообщение с задачей "
    "или напишите /request и описание."
)
GROUP_ADDED_HINT = (
    "Привет! Я бот СВОД — нахожу в переписке заявки и помогаю их оформить.\n"
    "Владелец организации: отправьте /connect, чтобы подключить эту группу."
)
GROUP_PRIVACY_WARNING = (
    "\n\n⚠️ Сейчас я вижу только команды и ответы мне. Чтобы находить заявки в переписке, "
    "сделайте меня администратором группы или отключите privacy mode в @BotFather."
)
GROUP_HELP = (
    "<b>СВОД в группе</b>\n\n"
    "Я читаю переписку и, когда разговор затихает, предлагаю заявки карточкой — "
    "её может подтвердить любой участник организации.\n\n"
    "/request — оформить заявку сейчас (можно ответом на сообщение или с описанием)\n"
    "/pause, /resume — выключить или включить автоматический поиск\n"
    "/connect, /disconnect — подключить или отключить группу (владелец организации)"
)

WORKFLOW_LABELS = {
    "draft": "черновик",
    "new": "новая",
    "waiting_info": "ждёт информацию",
    "planning": "планирование",
    "in_progress": "в работе",
    "completed": "работы завершены",
    "closed": "закрыта",
    "cancelled": "отменена",
    "archived": "в архиве",
}
PRIORITY_LABELS = {"low": "низкий", "medium": "средний", "high": "высокий", "urgent": "срочный"}

_STATUS_TEXT = {
    403: "Недостаточно прав для этого действия",
    404: "Заявка не найдена",
    409: "Действие недоступно в текущем статусе заявки",
    422: "Не хватает данных для этого действия — откройте заявку в СВОД",
}
_CYRILLIC = re.compile("[а-яА-ЯёЁ]")


def linked_greeting(full_name: str) -> str:
    return (
        f"Вы подключены как <b>{html.quote(full_name)}</b>.\n"
        "Уведомления по вашим заявкам будут приходить сюда. /help — что умеет бот."
    )


def link_success(full_name: str) -> str:
    return f"Готово! Аккаунт СВОД <b>{html.quote(full_name)}</b> подключён.\n\n{HELP}"


def organization_selected(name: str) -> str:
    return f"Текущая организация: <b>{html.quote(name)}</b>"


def group_connected(organization_name: str) -> str:
    return (
        f"✅ Группа подключена к организации <b>{html.quote(organization_name)}</b>.\n\n"
        "Я читаю сообщения этого чата, чтобы находить в них заявки, и храню их "
        f"{settings.TELEGRAM_MESSAGE_RETENTION_DAYS} дн.\n\n{GROUP_HELP}"
    )


def not_linked_greeting() -> str:
    return f"Здравствуйте! Это бот сервиса СВОД.\n\n{NOT_LINKED}\n{html.quote(settings.APP_PUBLIC_URL)}"


def service_error(exc: HTTPException) -> str:
    """Service errors are partly English — show Russian ones as is, map the rest by status."""
    detail = exc.detail if isinstance(exc.detail, str) else ""
    if _CYRILLIC.search(detail):
        return detail
    return _STATUS_TEXT.get(exc.status_code, "Не удалось выполнить действие")


def request_url(request_id: int | str) -> str:
    return f"{settings.APP_PUBLIC_URL.rstrip('/')}/requests/{request_id}"


def is_button_url(url: str) -> bool:
    """Telegram rejects inline URL buttons pointing at localhost."""
    host = (urlparse(url).hostname or "").lower()
    return host not in ("localhost", "127.0.0.1", "::1", "") and not host.endswith(".localhost")


def notification_text(notification: Notification) -> str:
    lines = [f"<b>{html.quote(notification.title)}</b>"]
    if notification.body:
        lines.append(html.quote(notification.body))
    if notification.request_id is not None:
        url = request_url(notification.request_id)
        if not is_button_url(url):
            lines.append(html.quote(url))
    return "\n".join(lines)


def request_line(request: Request) -> str:
    title = request.title if len(request.title) <= 80 else request.title[:79] + "…"
    status = WORKFLOW_LABELS.get(request.workflow_status, request.workflow_status)
    number = f'<a href="{html.quote(request_url(request.id))}">№ {request.id}</a>'
    return f"{number} {html.quote(title)} — {status}"


def request_list(heading: str, requests: list[Request]) -> str:
    if not requests:
        return f"<b>{html.quote(heading)}</b>\n{NO_REQUESTS}"
    return "\n".join([f"<b>{html.quote(heading)}</b>", *(request_line(r) for r in requests)])


def suggestion_card(suggestion: TelegramRequestSuggestion) -> str:
    heading = "💡 Похоже на заявку" if suggestion.source_kind == "group" else "📝 Черновик заявки"
    lines = [heading, "", f"<b>{html.quote(suggestion.title)}</b>"]
    if suggestion.summary:
        lines.append(html.quote(suggestion.summary))
    lines.append("")
    lines.append(f"Форма: {html.quote(suggestion.form_name or '—')}")
    lines.append(f"Приоритет: {PRIORITY_LABELS.get(suggestion.priority, suggestion.priority)}")
    filled = [key for key in (suggestion.data or {}) if key != ATTACHMENTS_FIELD_ID]
    lines.append(f"Заполнено полей: {len(filled)}")
    if suggestion.missing_required:
        missing = ", ".join(html.quote(str(label)) for label in suggestion.missing_required[:6])
        lines.append(f"⚠️ Не заполнены обязательные: {missing} — дозаполните в СВОД")
    if suggestion.attachments:
        lines.append(f"📎 Вложений: {len(suggestion.attachments)}")

    if suggestion.status == "created":
        lines += ["", f"✅ Создана заявка № {suggestion.request_id}"]
    elif suggestion.status == "dismissed":
        lines += ["", "✖ Не заявка" if suggestion.source_kind == "group" else "✖ Отменено"]
    elif suggestion.status == "expired":
        lines += ["", "⌛ Черновик устарел"]
    return "\n".join(lines)
