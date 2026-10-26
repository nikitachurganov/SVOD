import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_onboarding import UserOnboarding


async def get(session: AsyncSession, user_id: uuid.UUID) -> UserOnboarding | None:
    return await session.get(UserOnboarding, user_id)


async def get_or_create(session: AsyncSession, user_id: uuid.UUID) -> UserOnboarding:
    """The person's row, created (flushed, not committed) on first use."""
    row = await get(session, user_id)
    if row is None:
        row = UserOnboarding(user_id=user_id, purposes=[], dismissible=False, tour_status="pending")
        session.add(row)
        await session.flush()
    return row
