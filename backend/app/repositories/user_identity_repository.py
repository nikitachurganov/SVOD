import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_identity import UserIdentity


async def get(session: AsyncSession, provider: str, provider_user_id: str) -> UserIdentity | None:
    stmt = select(UserIdentity).where(
        UserIdentity.provider == provider,
        UserIdentity.provider_user_id == provider_user_id,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    provider: str,
    provider_user_id: str,
    email: str | None,
) -> UserIdentity:
    identity = UserIdentity(
        user_id=user_id, provider=provider, provider_user_id=provider_user_id, email=email
    )
    session.add(identity)
    await session.flush()
    return identity
