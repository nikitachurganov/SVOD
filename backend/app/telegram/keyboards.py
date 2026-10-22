from __future__ import annotations

import uuid

from aiogram.filters.callback_data import CallbackData
from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from app.models.notification import Notification
from app.models.organization import Organization
from app.models.request import Request
from app.models.telegram import TelegramRequestSuggestion
from app.telegram import texts


class RequestAction(CallbackData, prefix="rq"):
    action: str
    request_id: int


class StageAction(CallbackData, prefix="st"):
    action: str
    request_id: int
    stage_id: uuid.UUID


class SuggestionAction(CallbackData, prefix="sg"):
    # create | edit | forms | setform | back | dismiss
    action: str
    suggestion_id: uuid.UUID
    index: int = -1


class OrganizationAction(CallbackData, prefix="org"):
    # set — make current; new / free — make current and continue that command;
    # connect — connect the group chat to this organization
    action: str
    organization_id: uuid.UUID


def _open_button(builder: InlineKeyboardBuilder, request_id: int) -> None:
    url = texts.request_url(request_id)
    if texts.is_button_url(url):
        builder.button(text="Открыть в СВОД", url=url)


def open_request(request_id: int) -> InlineKeyboardMarkup | None:
    builder = InlineKeyboardBuilder()
    _open_button(builder, request_id)
    return builder.as_markup() if list(builder.buttons) else None


def notification_keyboard(notification: Notification) -> InlineKeyboardMarkup | None:
    if notification.request_id is None:
        return None
    builder = InlineKeyboardBuilder()
    _open_button(builder, notification.request_id)
    if notification.type == "request_created":
        builder.button(
            text="Взять в работу",
            callback_data=RequestAction(action="take", request_id=notification.request_id),
        )
    elif notification.type == "stage_started" and notification.stage_id is not None:
        builder.button(
            text="Завершить этап",
            callback_data=StageAction(
                action="complete", request_id=notification.request_id, stage_id=notification.stage_id
            ),
        )
    builder.adjust(1)
    return builder.as_markup() if list(builder.buttons) else None


def take_list_keyboard(requests: list[Request]) -> InlineKeyboardMarkup | None:
    builder = InlineKeyboardBuilder()
    for request in requests:
        builder.button(
            text=f"Взять № {request.id}",
            callback_data=RequestAction(action="take_list", request_id=request.id),
        )
    builder.adjust(3)
    return builder.as_markup() if requests else None


def suggestion_keyboard(suggestion: TelegramRequestSuggestion) -> InlineKeyboardMarkup | None:
    if suggestion.status == "created" and suggestion.request_id is not None:
        return open_request(suggestion.request_id)
    if suggestion.status != "pending":
        return None
    builder = InlineKeyboardBuilder()

    def add(text: str, action: str) -> None:
        builder.button(text=text, callback_data=SuggestionAction(action=action, suggestion_id=suggestion.id))

    add("✅ Создать", "create")
    add("✏️ Изменить", "edit")
    if len(suggestion.form_choices or []) > 1:
        add("🔁 Другая форма", "forms")
    add("✖ Не заявка" if suggestion.source_kind == "group" else "✖ Отмена", "dismiss")
    builder.adjust(2)
    return builder.as_markup()


def form_choice_keyboard(suggestion: TelegramRequestSuggestion) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for index, choice in enumerate(suggestion.form_choices or []):
        current = "• " if choice.get("id") == str(suggestion.form_id) else ""
        builder.button(
            text=f"{current}{choice.get('name', 'Форма')}"[:60],
            callback_data=SuggestionAction(action="setform", suggestion_id=suggestion.id, index=index),
        )
    builder.button(text="← Назад", callback_data=SuggestionAction(action="back", suggestion_id=suggestion.id))
    builder.adjust(1)
    return builder.as_markup()


def organizations_keyboard(
    organizations: list[Organization], *, action: str, current_id: uuid.UUID | None = None
) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for organization in organizations:
        mark = "• " if organization.id == current_id else ""
        builder.button(
            text=f"{mark}{organization.name}"[:60],
            callback_data=OrganizationAction(action=action, organization_id=organization.id),
        )
    builder.adjust(1)
    return builder.as_markup()
