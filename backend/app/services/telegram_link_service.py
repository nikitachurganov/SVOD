"""Linking SVOD accounts to Telegram via one-time t.me deep links."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.telegram import TelegramAccount, TelegramLinkToken
from app.models.user import User
from app.repositories import telegram_repository, user_repository
from app.schemas.telegram import TelegramLinkResponse, TelegramStatusResponse


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def bot_link(start_param: str | None = None) -> str:
    base = f"https://t.me/{settings.TELEGRAM_BOT_USERNAME.strip().lstrip('@')}"
    return f"{base}?start={start_param}" if start_param else base


async def get_status(session: AsyncSession, user: User) -> TelegramStatusResponse:
    account = await telegram_repository.get_account_by_user(session, user.id)
    return TelegramStatusResponse(
        enabled=settings.telegram_enabled,
        linked=account is not None,
        bot_username=settings.TELEGRAM_BOT_USERNAME.strip().lstrip("@") or None,
        username=account.username if account else None,
        display_name=account.display_name if account else None,
        linked_at=account.linked_at.isoformat() if account else None,
    )


async def create_link(session: AsyncSession, user: User) -> TelegramLinkResponse:
    if not settings.telegram_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram-бот не настроен на сервере",
        )
    # token_urlsafe only uses [A-Za-z0-9_-] — the alphabet Telegram allows in start parameters
    token = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.TELEGRAM_LINK_TOKEN_TTL_MINUTES)
    await telegram_repository.add_link_token(
        session,
        TelegramLinkToken(user_id=user.id, token_hash=_hash_token(token), expires_at=expires_at),
    )
    await session.commit()
    return TelegramLinkResponse(url=bot_link(token), expires_at=expires_at.isoformat())


async def unlink(session: AsyncSession, user: User) -> None:
    account = await telegram_repository.get_account_by_user(session, user.id)
    if account is None:
        return
    await telegram_repository.delete_account(session, account)
    await session.commit()


async def consume_link_token(
    session: AsyncSession,
    token: str,
    *,
    telegram_user_id: int,
    username: str | None,
    display_name: str | None,
) -> User | None:
    """Bind the Telegram user to the token owner. Returns None for unknown, used or expired tokens.

    One Telegram account maps to one SVOD user: a previous binding of either side is replaced.
    """
    row = await telegram_repository.get_link_token_for_update(session, _hash_token(token))
    now = datetime.now(timezone.utc)
    if row is None or row.used_at is not None or row.expires_at <= now:
        return None
    user = await user_repository.get_by_id(session, row.user_id)
    if user is None or not user.is_active:
        return None
    row.used_at = now

    previous = {
        account.id: account
        for account in (
            await telegram_repository.get_account_by_telegram_id(session, telegram_user_id),
            await telegram_repository.get_account_by_user(session, user.id),
        )
        if account is not None
    }
    for account in previous.values():
        await telegram_repository.delete_account(session, account)

    session.add(
        TelegramAccount(
            user_id=user.id,
            telegram_user_id=telegram_user_id,
            username=username,
            display_name=display_name,
            linked_at=now,
        )
    )
    await session.commit()
    return user


async def get_linked_user(
    session: AsyncSession, telegram_user_id: int
) -> tuple[TelegramAccount, User] | None:
    account = await telegram_repository.get_account_by_telegram_id(session, telegram_user_id)
    if account is None or account.user is None or not account.user.is_active:
        return None
    return account, account.user
