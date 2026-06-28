import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.public_link import PublicRequestLink


async def get_by_token(session: AsyncSession, token: str) -> PublicRequestLink | None:
    stmt = (
        select(PublicRequestLink)
        .options(selectinload(PublicRequestLink.organization))
        .where(PublicRequestLink.token == token, PublicRequestLink.is_active.is_(True))
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_by_token_any(session: AsyncSession, token: str) -> PublicRequestLink | None:
    stmt = (
        select(PublicRequestLink)
        .options(selectinload(PublicRequestLink.organization))
        .where(PublicRequestLink.token == token)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_by_org(
    session: AsyncSession, org_id: uuid.UUID
) -> PublicRequestLink | None:
    stmt = (
        select(PublicRequestLink)
        .options(selectinload(PublicRequestLink.organization))
        .where(
            PublicRequestLink.organization_id == org_id,
            PublicRequestLink.is_active.is_(True),
        )
        .order_by(PublicRequestLink.created_at.desc())
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create(
    session: AsyncSession, link: PublicRequestLink
) -> PublicRequestLink:
    session.add(link)
    await session.flush()
    await session.refresh(link, attribute_names=["organization"])
    return link
