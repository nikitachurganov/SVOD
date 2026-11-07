import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.token_grant import TokenGrant


def _usable(user_id: uuid.UUID, now: datetime):
    return (
        TokenGrant.user_id == user_id,
        TokenGrant.revoked_at.is_(None),
        TokenGrant.expires_at > now,
        TokenGrant.used < TokenGrant.amount,
    )


async def add(session: AsyncSession, grant: TokenGrant) -> TokenGrant:
    session.add(grant)
    await session.flush()
    return grant


async def remaining(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> int:
    """Токены+ left in the grants that are still valid."""
    result = await session.execute(
        select(func.coalesce(func.sum(TokenGrant.amount - TokenGrant.used), 0)).where(
            *_usable(user_id, now)
        )
    )
    return int(result.scalar_one() or 0)


async def consume(session: AsyncSession, user_id: uuid.UUID, tokens: int, now: datetime) -> int:
    """Spend up to ``tokens`` from the grants that expire first; returns how many were taken."""
    if tokens <= 0:
        return 0
    rows = (
        (
            await session.execute(
                select(TokenGrant)
                .where(*_usable(user_id, now))
                .order_by(TokenGrant.expires_at, TokenGrant.created_at)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    taken = 0
    for grant in rows:
        step = min(tokens - taken, grant.amount - grant.used)
        grant.used += step
        taken += step
        if taken >= tokens:
            break
    return taken


async def get_for_payment(session: AsyncSession, payment_id: uuid.UUID) -> TokenGrant | None:
    return (
        await session.execute(select(TokenGrant).where(TokenGrant.payment_id == payment_id))
    ).scalar_one_or_none()


async def revoke_for_payment(session: AsyncSession, payment_id: uuid.UUID, now: datetime) -> int:
    """A refund takes the pack back; returns how many grants were revoked (0 or 1)."""
    result = await session.execute(
        update(TokenGrant)
        .where(TokenGrant.payment_id == payment_id, TokenGrant.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    return result.rowcount or 0
