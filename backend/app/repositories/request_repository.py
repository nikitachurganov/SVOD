import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.request import Request


async def get_all(session: AsyncSession) -> list[Request]:
    stmt = select(Request).options(selectinload(Request.author)).order_by(Request.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_all_by_org(session: AsyncSession, org_id: uuid.UUID) -> list[Request]:
    stmt = (
        select(Request)
        .options(selectinload(Request.author))
        .where(Request.organization_id == org_id)
        .order_by(Request.created_at.desc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_by_id(session: AsyncSession, request_id: int) -> Request | None:
    stmt = (
        select(Request)
        .options(selectinload(Request.author))
        .where(Request.id == request_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create(session: AsyncSession, request: Request) -> Request:
    session.add(request)
    await session.flush()
    await session.refresh(request)
    return request


async def update(session: AsyncSession, request: Request) -> Request:
    await session.flush()
    await session.refresh(request)
    return request


async def remove(session: AsyncSession, request_id: int) -> bool:
    stmt = delete(Request).where(Request.id == request_id)
    result = await session.execute(stmt)
    return result.rowcount > 0
