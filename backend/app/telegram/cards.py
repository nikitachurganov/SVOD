"""Request draft cards: show, remember where they are, update in place."""

from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.types import Message, ReplyParameters
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telegram import TelegramRequestSuggestion
from app.telegram import keyboards, texts

logger = logging.getLogger("svod.telegram.cards")


async def _remember(card: Message | bool, suggestion: TelegramRequestSuggestion, session: AsyncSession) -> None:
    if isinstance(card, Message):
        suggestion.card_chat_id = card.chat.id
        suggestion.card_message_id = card.message_id
        await session.commit()


async def publish_card(message: Message, suggestion: TelegramRequestSuggestion, session: AsyncSession) -> None:
    """Turn a placeholder message («Готовлю черновик…») into the card."""
    card = await message.edit_text(
        texts.suggestion_card(suggestion), reply_markup=keyboards.suggestion_keyboard(suggestion)
    )
    await _remember(card, suggestion, session)


async def post_card(
    bot: Bot, chat_id: int, suggestion: TelegramRequestSuggestion, session: AsyncSession
) -> None:
    """Send a new card, as a reply to the first message of the dialog when there is one."""
    first_message_id = next(
        (item.get("message_id") for item in suggestion.transcript or [] if isinstance(item, dict)), None
    )
    reply = (
        ReplyParameters(message_id=first_message_id, allow_sending_without_reply=True)
        if first_message_id
        else None
    )
    try:
        card = await bot.send_message(
            chat_id,
            texts.suggestion_card(suggestion),
            reply_markup=keyboards.suggestion_keyboard(suggestion),
            reply_parameters=reply,
        )
    except TelegramAPIError:
        logger.exception("Could not post card of suggestion %s to chat %s", suggestion.id, chat_id)
        return
    await _remember(card, suggestion, session)


async def refresh_card(bot: Bot, suggestion: TelegramRequestSuggestion) -> None:
    if suggestion.card_chat_id is None or suggestion.card_message_id is None:
        return
    try:
        await bot.edit_message_text(
            texts.suggestion_card(suggestion),
            chat_id=suggestion.card_chat_id,
            message_id=suggestion.card_message_id,
            reply_markup=keyboards.suggestion_keyboard(suggestion),
        )
    except TelegramBadRequest:
        # "message is not modified" or the card was deleted — nothing to update
        logger.debug("Card of suggestion %s was not updated", suggestion.id)
