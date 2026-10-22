"""Request draft cards (private /new and group suggestions): create, edit, change form, dismiss."""

from __future__ import annotations

import uuid

from aiogram import Bot, F, Router, html
from aiogram.enums import ChatType
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.base import StorageKey
from aiogram.types import CallbackQuery, MaybeInaccessibleMessage, Message
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram import TelegramRequestSuggestion
from app.services import telegram_link_service, telegram_suggestion_service
from app.services.telegram_suggestion_service import SuggestionError
from app.telegram import keyboards, texts
from app.telegram.attachments import download_attachments
from app.telegram.cards import refresh_card
from app.telegram.keyboards import SuggestionAction

router = Router(name="suggestions")


class EditSuggestion(StatesGroup):
    waiting_text = State()


async def _edit_markup(message: MaybeInaccessibleMessage | None, markup) -> None:
    if isinstance(message, Message):
        try:
            await message.edit_reply_markup(reply_markup=markup)
        except TelegramBadRequest:
            pass


async def _start_edit_in_private(
    callback: CallbackQuery, bot: Bot, state: FSMContext, suggestion: TelegramRequestSuggestion
) -> None:
    """Editing always happens in the private chat, so group chats are not flooded."""
    user_id = callback.from_user.id
    private_state = FSMContext(
        storage=state.storage, key=StorageKey(bot_id=bot.id, chat_id=user_id, user_id=user_id)
    )
    try:
        await bot.send_message(
            user_id, f"✏️ <b>{html.quote(suggestion.title)}</b>\n\n{texts.ASK_SUGGESTION_EDIT}"
        )
    except TelegramForbiddenError:
        await callback.answer("Сначала откройте личный чат с ботом и нажмите «Запустить»", show_alert=True)
        return
    await private_state.set_state(EditSuggestion.waiting_text)
    await private_state.update_data(suggestion_id=str(suggestion.id))
    in_private = isinstance(callback.message, Message) and callback.message.chat.type == ChatType.PRIVATE
    await callback.answer(None if in_private else "Продолжим в личных сообщениях с ботом")


@router.callback_query(SuggestionAction.filter())
async def on_suggestion_action(
    callback: CallbackQuery,
    callback_data: SuggestionAction,
    session: AsyncSession,
    state: FSMContext,
    bot: Bot,
) -> None:
    linked = await telegram_link_service.get_linked_user(session, callback.from_user.id)
    if linked is None:
        await callback.answer(texts.NOT_LINKED, show_alert=True)
        return
    _account, user = linked
    try:
        suggestion = await telegram_suggestion_service.load_for_action(
            session, callback_data.suggestion_id, user
        )
    except SuggestionError as exc:
        await session.rollback()
        await callback.answer(str(exc), show_alert=True)
        return

    action = callback_data.action
    if action in ("forms", "back", "edit"):
        # Read-only for now: release the row lock
        await session.rollback()
        if action == "forms":
            await _edit_markup(callback.message, keyboards.form_choice_keyboard(suggestion))
            await callback.answer(texts.CHOOSE_FORM)
        elif action == "back":
            await _edit_markup(callback.message, keyboards.suggestion_keyboard(suggestion))
            await callback.answer()
        else:
            await _start_edit_in_private(callback, bot, state, suggestion)
        return

    if action == "setform":
        choices = suggestion.form_choices or []
        if not 0 <= callback_data.index < len(choices):
            await session.rollback()
            await callback.answer("Форма не найдена", show_alert=True)
            return
        await callback.answer("Заполняю поля заново…")
        try:
            await telegram_suggestion_service.change_form(
                session, suggestion, uuid.UUID(choices[callback_data.index]["id"])
            )
        except SuggestionError as exc:
            await session.rollback()
            if isinstance(callback.message, Message):
                await callback.message.answer(str(exc))
            return
        await refresh_card(bot, suggestion)
        return

    if action == "dismiss":
        await telegram_suggestion_service.dismiss(session, suggestion, user)
        await callback.answer()
        await refresh_card(bot, suggestion)
        return

    if action == "create":
        try:
            request_id = await telegram_suggestion_service.confirm(session, suggestion, user)
        except SuggestionError as exc:
            await session.rollback()
            await callback.answer(str(exc), show_alert=True)
            return
        except HTTPException as exc:
            await session.rollback()
            await callback.answer(texts.service_error(exc), show_alert=True)
            return
        await callback.answer(f"Создана заявка № {request_id}")
        await refresh_card(bot, suggestion)
        if suggestion.attachments:
            files = await download_attachments(bot, suggestion.attachments)
            await telegram_suggestion_service.attach_files(session, request_id, files)
        return

    await session.rollback()
    await callback.answer()


@router.message(EditSuggestion.waiting_text, F.chat.type == ChatType.PRIVATE)
async def on_edit_text(message: Message, state: FSMContext, session: AsyncSession, bot: Bot) -> None:
    text = (message.text or "").strip()
    if not text or text.startswith("/"):
        await message.answer(texts.ASK_SUGGESTION_EDIT)
        return
    if message.from_user is None:
        return
    data = await state.get_data()
    await state.clear()
    linked = await telegram_link_service.get_linked_user(session, message.from_user.id)
    if linked is None:
        await message.answer(texts.NOT_LINKED)
        return
    _account, user = linked
    try:
        suggestion = await telegram_suggestion_service.load_for_action(
            session, uuid.UUID(data["suggestion_id"]), user
        )
    except SuggestionError as exc:
        await session.rollback()
        await message.answer(str(exc))
        return
    title, _, summary = text.partition("\n")
    await telegram_suggestion_service.update_text(session, suggestion, title=title, summary=summary or None)
    await refresh_card(bot, suggestion)
    if suggestion.card_chat_id == message.chat.id:
        await message.answer("Черновик обновлён ☝️")
    else:
        await message.answer("Черновик обновлён — карточка в группе изменилась.")
