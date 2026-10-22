import uuid
from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.telegram import (
    TelegramAccount,
    TelegramChat,
    TelegramLinkToken,
    TelegramMessage,
    TelegramRequestSuggestion,
)


async def get_account_by_user(session: AsyncSession, user_id: uuid.UUID) -> TelegramAccount | None:
    stmt = select(TelegramAccount).where(TelegramAccount.user_id == user_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_account_by_telegram_id(
    session: AsyncSession, telegram_user_id: int
) -> TelegramAccount | None:
    stmt = select(TelegramAccount).where(TelegramAccount.telegram_user_id == telegram_user_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def delete_account(session: AsyncSession, account: TelegramAccount) -> None:
    await session.delete(account)
    await session.flush()


async def add_link_token(session: AsyncSession, token: TelegramLinkToken) -> TelegramLinkToken:
    session.add(token)
    await session.flush()
    return token


async def get_link_token_for_update(
    session: AsyncSession, token_hash: str
) -> TelegramLinkToken | None:
    stmt = (
        select(TelegramLinkToken)
        .where(TelegramLinkToken.token_hash == token_hash)
        .with_for_update()
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def claim_pending_notifications(
    session: AsyncSession, *, not_older_than: datetime, limit: int
) -> list[tuple[Notification, TelegramAccount]]:
    """Undelivered notifications of linked users, created after linking, oldest first."""
    stmt = (
        select(Notification, TelegramAccount)
        .join(TelegramAccount, TelegramAccount.user_id == Notification.recipient_user_id)
        .where(
            Notification.telegram_sent_at.is_(None),
            Notification.created_at >= not_older_than,
            Notification.created_at >= TelegramAccount.linked_at,
            TelegramAccount.blocked_at.is_(None),
        )
        .order_by(Notification.created_at.asc())
        .limit(limit)
        .with_for_update(of=Notification, skip_locked=True)
    )
    result = await session.execute(stmt)
    return [(row[0], row[1]) for row in result.all()]


async def add_suggestion(
    session: AsyncSession, suggestion: TelegramRequestSuggestion
) -> TelegramRequestSuggestion:
    session.add(suggestion)
    await session.flush()
    return suggestion


async def get_suggestion_for_update(
    session: AsyncSession, suggestion_id: uuid.UUID
) -> TelegramRequestSuggestion | None:
    stmt = (
        select(TelegramRequestSuggestion)
        .where(TelegramRequestSuggestion.id == suggestion_id)
        .with_for_update()
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_suggestion_by_request(
    session: AsyncSession, request_id: int
) -> TelegramRequestSuggestion | None:
    stmt = select(TelegramRequestSuggestion).where(TelegramRequestSuggestion.request_id == request_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_pending_suggestions_for_chat(
    session: AsyncSession, chat_id: int, *, created_after: datetime
) -> list[TelegramRequestSuggestion]:
    stmt = (
        select(TelegramRequestSuggestion)
        .where(
            TelegramRequestSuggestion.telegram_chat_id == chat_id,
            TelegramRequestSuggestion.status == "pending",
            TelegramRequestSuggestion.created_at >= created_after,
        )
        .order_by(TelegramRequestSuggestion.created_at.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_stale_pending_suggestions(
    session: AsyncSession, *, created_before: datetime
) -> list[TelegramRequestSuggestion]:
    stmt = (
        select(TelegramRequestSuggestion)
        .where(
            TelegramRequestSuggestion.status == "pending",
            TelegramRequestSuggestion.created_at < created_before,
        )
        .with_for_update(skip_locked=True)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


# ─── Group chats ─────────────────────────────────────────────────────────────


async def get_chat(session: AsyncSession, chat_id: int) -> TelegramChat | None:
    stmt = select(TelegramChat).where(TelegramChat.chat_id == chat_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def add_chat(session: AsyncSession, chat: TelegramChat) -> TelegramChat:
    session.add(chat)
    await session.flush()
    return chat


async def insert_message(session: AsyncSession, values: dict) -> None:
    """Telegram may redeliver an update — duplicates are ignored."""
    stmt = pg_insert(TelegramMessage).values(id=uuid.uuid4(), **values)
    await session.execute(stmt.on_conflict_do_nothing(constraint="uq_telegram_messages_chat_message"))


async def list_messages_after(
    session: AsyncSession, chat_id: int, *, after_message_id: int | None, limit: int
) -> list[TelegramMessage]:
    stmt = select(TelegramMessage).where(TelegramMessage.chat_id == chat_id)
    if after_message_id is not None:
        stmt = stmt.where(TelegramMessage.message_id > after_message_id)
    stmt = stmt.order_by(TelegramMessage.message_id.asc()).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_messages_up_to(
    session: AsyncSession, chat_id: int, *, up_to_message_id: int | None, limit: int
) -> list[TelegramMessage]:
    """The last `limit` messages up to the given id (inclusive), oldest first."""
    stmt = select(TelegramMessage).where(TelegramMessage.chat_id == chat_id)
    if up_to_message_id is not None:
        stmt = stmt.where(TelegramMessage.message_id <= up_to_message_id)
    stmt = stmt.order_by(TelegramMessage.message_id.desc()).limit(limit)
    result = await session.execute(stmt)
    return list(reversed(result.scalars().all()))


async def list_chat_ids_ready_for_analysis(
    session: AsyncSession, *, silent_since: datetime, min_messages: int
) -> list[int]:
    """Active chats with enough unanalyzed messages and no new ones since `silent_since`."""
    unanalyzed = (
        select(func.count(TelegramMessage.id))
        .where(
            TelegramMessage.chat_id == TelegramChat.chat_id,
            TelegramMessage.message_id > func.coalesce(TelegramChat.last_analyzed_message_id, 0),
        )
        .scalar_subquery()
    )
    stmt = select(TelegramChat.chat_id).where(
        TelegramChat.is_active.is_(True),
        TelegramChat.paused.is_(False),
        TelegramChat.last_message_at.is_not(None),
        TelegramChat.last_message_at <= silent_since,
        unanalyzed >= min_messages,
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def delete_messages(
    session: AsyncSession, *, chat_id: int | None = None, sent_before: datetime | None = None
) -> int:
    stmt = delete(TelegramMessage)
    if chat_id is not None:
        stmt = stmt.where(TelegramMessage.chat_id == chat_id)
    if sent_before is not None:
        stmt = stmt.where(TelegramMessage.sent_at < sent_before)
    result = await session.execute(stmt)
    return result.rowcount or 0


async def move_chat_messages(session: AsyncSession, *, old_chat_id: int, new_chat_id: int) -> None:
    await session.execute(
        update(TelegramMessage).where(TelegramMessage.chat_id == old_chat_id).values(chat_id=new_chat_id)
    )
