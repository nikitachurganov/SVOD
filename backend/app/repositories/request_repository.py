import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.request import Request
from app.models.request_stage import RequestStage


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
        .options(
            selectinload(Request.author),
            selectinload(Request.assigned_internal_user),
            selectinload(Request.assigned_external_contractor),
            selectinload(Request.stages).selectinload(RequestStage.assignee_internal_user),
            selectinload(Request.stages).selectinload(RequestStage.assignee_external_contractor),
        )
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


async def count_active_for_internal_user(
    session: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    exclude_request_id: int | None = None,
) -> int:
    stmt = (
        select(func.count())
        .select_from(Request)
        .where(
            Request.organization_id == organization_id,
            Request.assigned_kind == "internal",
            Request.assigned_internal_user_id == user_id,
            Request.status != "closed",
        )
    )
    if exclude_request_id is not None:
        stmt = stmt.where(Request.id != exclude_request_id)
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


async def count_active_for_external_contractor(
    session: AsyncSession,
    organization_id: uuid.UUID,
    contractor_id: uuid.UUID,
    *,
    exclude_request_id: int | None = None,
) -> int:
    stmt = (
        select(func.count())
        .select_from(Request)
        .where(
            Request.organization_id == organization_id,
            Request.assigned_kind == "external",
            Request.assigned_external_contractor_id == contractor_id,
            Request.status != "closed",
        )
    )
    if exclude_request_id is not None:
        stmt = stmt.where(Request.id != exclude_request_id)
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


async def count_closed_same_form_internal(
    session: AsyncSession,
    form_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> int:
    stmt = (
        select(func.count())
        .select_from(Request)
        .where(
            Request.organization_id == organization_id,
            Request.form_id == form_id,
            Request.status == "closed",
            Request.assigned_kind == "internal",
            Request.assigned_internal_user_id == user_id,
        )
    )
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


async def count_closed_same_form_external(
    session: AsyncSession,
    form_id: uuid.UUID,
    organization_id: uuid.UUID,
    contractor_id: uuid.UUID,
) -> int:
    stmt = (
        select(func.count())
        .select_from(Request)
        .where(
            Request.organization_id == organization_id,
            Request.form_id == form_id,
            Request.status == "closed",
            Request.assigned_kind == "external",
            Request.assigned_external_contractor_id == contractor_id,
        )
    )
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)
