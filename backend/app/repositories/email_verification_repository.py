import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_verification import EmailVerificationToken


async def create(
    session: AsyncSession, *, user_id: uuid.UUID, token_hash: str, expires_at: datetime
) -> EmailVerificationToken:
    row = EmailVerificationToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    session.add(row)
    await session.flush()
    return row


async def get_by_hash(session: AsyncSession, token_hash: str) -> EmailVerificationToken | None:
    stmt = select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def latest_created_at(session: AsyncSession, user_id: uuid.UUID) -> datetime | None:
    stmt = select(func.max(EmailVerificationToken.created_at)).where(
        EmailVerificationToken.user_id == user_id
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def invalidate_unused(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    """Burn every outstanding link of the user (a newer request or a successful confirmation)."""
    stmt = (
        update(EmailVerificationToken)
        .where(EmailVerificationToken.user_id == user_id, EmailVerificationToken.used_at.is_(None))
        .values(used_at=now)
    )
    await session.execute(stmt)
