"""Background loops of the bot process."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from aiogram import Bot
from aiogram.exceptions import (
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramNetworkError,
    TelegramRetryAfter,
    TelegramServerError,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_factory
from app.repositories import telegram_repository
from app.services import telegram_group_service
from app.telegram import cards, keyboards, texts

logger = logging.getLogger("svod.telegram.loops")

OUTBOX_BATCH_SIZE = 20
GROUP_ANALYSIS_INTERVAL_SECONDS = 20
HOUSEKEEPING_INTERVAL_SECONDS = 600


async def deliver_notification_batch(session: AsyncSession, bot: Bot) -> int:
    """Send pending notifications to linked users; returns how many rows were processed.

    Unsendable rows (blocked bot, bad request) are marked as sent so they don't loop forever;
    transient failures leave the row pending for the next iteration.
    """
    now = datetime.now(timezone.utc)
    rows = await telegram_repository.claim_pending_notifications(
        session,
        not_older_than=now - timedelta(hours=settings.TELEGRAM_NOTIFICATION_MAX_AGE_HOURS),
        limit=OUTBOX_BATCH_SIZE,
    )
    processed = 0
    for notification, account in rows:
        try:
            await bot.send_message(
                account.telegram_user_id,
                texts.notification_text(notification),
                reply_markup=keyboards.notification_keyboard(notification),
            )
        except TelegramRetryAfter as exc:
            await session.commit()
            await asyncio.sleep(exc.retry_after)
            return processed
        except (TelegramNetworkError, TelegramServerError):
            logger.warning("Telegram is unavailable, will retry notification %s", notification.id)
            break
        except TelegramForbiddenError:
            logger.info("User %s blocked the bot", account.user_id)
            account.blocked_at = now
        except TelegramBadRequest:
            logger.exception("Telegram rejected notification %s", notification.id)
        notification.telegram_sent_at = now
        processed += 1
    await session.commit()
    return processed


async def analyze_ready_chats(bot: Bot) -> int:
    """Passive detection in groups where the conversation went quiet; returns cards posted or updated."""
    async with async_session_factory() as session:
        chat_ids = await telegram_repository.list_chat_ids_ready_for_analysis(
            session,
            silent_since=datetime.now(timezone.utc) - timedelta(seconds=settings.TELEGRAM_ANALYSIS_IDLE_SECONDS),
            min_messages=settings.TELEGRAM_ANALYSIS_MIN_MESSAGES,
        )
    shown = 0
    for chat_id in chat_ids:
        # One session per chat: a failure in one group must not block the others
        async with async_session_factory() as session:
            chat = await telegram_repository.get_chat(session, chat_id)
            if chat is None:
                continue
            for suggestion, is_new in await telegram_group_service.analyze_chat(session, chat):
                if is_new:
                    await cards.post_card(bot, chat.chat_id, suggestion, session)
                else:
                    await cards.refresh_card(bot, suggestion)
                shown += 1
    return shown


async def run_housekeeping(bot: Bot) -> None:
    """Expire old drafts (their cards lose the buttons) and drop messages past retention."""
    async with async_session_factory() as session:
        for suggestion in await telegram_group_service.expire_suggestions(session):
            await cards.refresh_card(bot, suggestion)
        removed = await telegram_group_service.purge_old_messages(session)
    if removed:
        logger.info("Removed %s Telegram messages past retention", removed)


async def run_group_loops(bot: Bot) -> None:
    last_housekeeping = 0.0
    loop = asyncio.get_running_loop()
    while True:
        try:
            await analyze_ready_chats(bot)
        except Exception:
            logger.exception("Telegram group analysis iteration failed")
        if loop.time() - last_housekeeping >= HOUSEKEEPING_INTERVAL_SECONDS:
            try:
                await run_housekeeping(bot)
            except Exception:
                logger.exception("Telegram housekeeping failed")
            last_housekeeping = loop.time()
        await asyncio.sleep(GROUP_ANALYSIS_INTERVAL_SECONDS)


async def run_notification_outbox(bot: Bot) -> None:
    while True:
        processed = 0
        try:
            async with async_session_factory() as session:
                processed = await deliver_notification_batch(session, bot)
        except Exception:
            logger.exception("Telegram outbox iteration failed")
        if processed < OUTBOX_BATCH_SIZE:
            await asyncio.sleep(max(settings.TELEGRAM_POLL_SECONDS, 0.5))
