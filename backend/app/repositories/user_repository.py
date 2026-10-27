import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def get_by_email(session: AsyncSession, email: str) -> User | None:
    stmt = select(User).where(User.email == email)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_by_email_ignore_case(session: AsyncSession, email: str) -> User | None:
    """For operator tools, where the address is typed by hand."""
    stmt = select(User).where(func.lower(User.email) == email.lower())
    result = await session.execute(stmt)
    return result.scalars().first()


async def list_active_ids(
    session: AsyncSession, *, after_id: uuid.UUID | None = None, limit: int = 200
) -> list[uuid.UUID]:
    """Ids of the active accounts in a stable order, for batch operator commands."""
    stmt = select(User.id).where(User.is_active.is_(True))
    if after_id is not None:
        stmt = stmt.where(User.id > after_id)
    result = await session.execute(stmt.order_by(User.id).limit(limit))
    return list(result.scalars().all())


async def create(session: AsyncSession, user: User) -> User:
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return user
