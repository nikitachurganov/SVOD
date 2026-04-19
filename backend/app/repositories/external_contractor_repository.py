import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.external_contractor import ExternalContractor


async def list_by_org(
    session: AsyncSession, org_id: uuid.UUID
) -> list[ExternalContractor]:
    stmt = (
        select(ExternalContractor)
        .where(ExternalContractor.organization_id == org_id)
        .order_by(ExternalContractor.full_name.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_by_id(
    session: AsyncSession, contractor_id: uuid.UUID, org_id: uuid.UUID
) -> ExternalContractor | None:
    stmt = select(ExternalContractor).where(
        ExternalContractor.id == contractor_id,
        ExternalContractor.organization_id == org_id,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create(session: AsyncSession, row: ExternalContractor) -> ExternalContractor:
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return row
