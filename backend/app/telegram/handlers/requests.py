"""Quick actions from notification buttons: take a request, complete a stage."""

from __future__ import annotations

import uuid

from aiogram import F, Router
from aiogram.enums import ChatType
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.request_execution import CompleteStagePayload
from app.services import request_execution_service, request_lifecycle_service, telegram_link_service
from app.telegram import keyboards, texts
from app.telegram.keyboards import RequestAction, StageAction

router = Router(name="requests")


class CompleteStage(StatesGroup):
    waiting_result = State()


async def _append_to_message(callback: CallbackQuery, note: str, request_id: int) -> None:
    """Replace action buttons with a result note; old messages may be inaccessible."""
    message = callback.message
    if not isinstance(message, Message) or message.html_text is None:
        return
    await message.edit_text(
        f"{message.html_text}\n\n{note}",
        reply_markup=keyboards.open_request(request_id),
    )


@router.callback_query(RequestAction.filter(F.action.in_({"take", "take_list"})))
async def take_request(
    callback: CallbackQuery, callback_data: RequestAction, session: AsyncSession
) -> None:
    linked = await telegram_link_service.get_linked_user(session, callback.from_user.id)
    if linked is None:
        await callback.answer(texts.NOT_LINKED, show_alert=True)
        return
    _account, user = linked
    try:
        await request_lifecycle_service.take_request(session, callback_data.request_id, user)
    except HTTPException as exc:
        await session.rollback()
        await callback.answer(texts.service_error(exc), show_alert=True)
        return
    await callback.answer("Заявка теперь ваша")
    if callback_data.action == "take":
        await _append_to_message(callback, "✅ Вы взяли заявку в работу", callback_data.request_id)
    elif isinstance(callback.message, Message):
        # A /free list has buttons for several requests — keep it, report separately
        await callback.message.answer(
            f"✅ Вы взяли заявку № {callback_data.request_id} в работу",
            reply_markup=keyboards.open_request(callback_data.request_id),
        )


@router.callback_query(StageAction.filter(F.action == "complete"))
async def ask_stage_result(
    callback: CallbackQuery, callback_data: StageAction, state: FSMContext, session: AsyncSession
) -> None:
    if await telegram_link_service.get_linked_user(session, callback.from_user.id) is None:
        await callback.answer(texts.NOT_LINKED, show_alert=True)
        return
    await state.set_state(CompleteStage.waiting_result)
    await state.update_data(request_id=callback_data.request_id, stage_id=str(callback_data.stage_id))
    await callback.answer()
    if isinstance(callback.message, Message):
        await callback.message.answer(texts.ASK_STAGE_RESULT)


@router.message(CompleteStage.waiting_result, F.chat.type == ChatType.PRIVATE)
async def complete_stage(message: Message, state: FSMContext, session: AsyncSession) -> None:
    # /start, /help, /cancel are handled by the private router, which is registered first
    result = (message.text or message.caption or "").strip()
    if not result or result.startswith("/"):
        await message.answer(texts.STAGE_RESULT_EMPTY)
        return
    if message.from_user is None:
        return
    linked = await telegram_link_service.get_linked_user(session, message.from_user.id)
    data = await state.get_data()
    await state.clear()
    if linked is None:
        await message.answer(texts.NOT_LINKED)
        return
    _account, user = linked
    request_id = int(data["request_id"])
    try:
        await request_execution_service.complete_stage(
            session,
            request_id,
            uuid.UUID(data["stage_id"]),
            CompleteStagePayload(result_summary=result),
            user,
        )
    except HTTPException as exc:
        await session.rollback()
        await message.answer(texts.service_error(exc))
        return
    await message.answer("✅ Этап завершён", reply_markup=keyboards.open_request(request_id))
