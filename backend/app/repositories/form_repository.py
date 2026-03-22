import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.form import Form


async def get_all(session: AsyncSession) -> list[Form]:
    stmt = select(Form).options(selectinload(Form.author)).order_by(Form.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_all_by_org(session: AsyncSession, org_id: uuid.UUID) -> list[Form]:
    stmt = (
        select(Form)
        .options(selectinload(Form.author))
        .where(Form.organization_id == org_id)
        .order_by(Form.created_at.desc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_by_id(session: AsyncSession, form_id: uuid.UUID) -> Form | None:
    stmt = select(Form).options(selectinload(Form.author)).where(Form.id == form_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create(session: AsyncSession, form: Form) -> Form:
    session.add(form)
    await session.flush()
    await session.refresh(form)
    return form


async def update(session: AsyncSession, form: Form) -> Form:
    await session.flush()
    await session.refresh(form)
    return form


async def remove(session: AsyncSession, form_id: uuid.UUID) -> bool:
    stmt = delete(Form).where(Form.id == form_id)
    result = await session.execute(stmt)
    return result.rowcount > 0
