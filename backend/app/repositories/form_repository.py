import uuid
from collections.abc import Sequence

from sqlalchemy import false, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.form import Form
from app.models.request import Request


async def get_all(session: AsyncSession) -> list[Form]:
    stmt = select(Form).options(selectinload(Form.author)).order_by(Form.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_active_by_org(session: AsyncSession, org_id: uuid.UUID) -> list[Form]:
    stmt = (
        select(Form)
        .options(selectinload(Form.author))
        .where(Form.organization_id == org_id, Form.archived.is_(False))
        .order_by(Form.created_at.desc())
    )
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


def _apply_form_filters(
    stmt,
    *,
    organization_id: uuid.UUID | None = None,
    organization_ids: Sequence[uuid.UUID] | None = None,
    archived: bool | None = None,
    created_by_user_id: uuid.UUID | None = None,
    unused: bool | None = None,
):
    if organization_id is not None:
        stmt = stmt.where(Form.organization_id == organization_id)
    elif organization_ids is not None:
        if len(organization_ids) == 0:
            stmt = stmt.where(false())
        else:
            stmt = stmt.where(Form.organization_id.in_(organization_ids))
    if archived is True:
        stmt = stmt.where(Form.archived == True)  # noqa: E712
    elif archived is False:
        stmt = stmt.where(Form.archived == False)  # noqa: E712
    if created_by_user_id is not None:
        stmt = stmt.where(Form.created_by_user_id == created_by_user_id)
    if unused is True:
        sub = (
            select(func.count(Request.id))
            .where(Request.form_id == Form.id)
            .correlate(Form)
            .scalar_subquery()
        )
        stmt = stmt.where(sub == 0)
    return stmt


async def get_all_filtered(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID | None = None,
    organization_ids: Sequence[uuid.UUID] | None = None,
    archived: bool | None = None,
    created_by_user_id: uuid.UUID | None = None,
    unused: bool | None = None,
) -> list[Form]:
    stmt = select(Form).options(selectinload(Form.author))
    stmt = _apply_form_filters(
        stmt,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=archived,
        created_by_user_id=created_by_user_id,
        unused=unused,
    )
    stmt = stmt.order_by(Form.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def count_filtered(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID | None = None,
    organization_ids: Sequence[uuid.UUID] | None = None,
    archived: bool | None = None,
    created_by_user_id: uuid.UUID | None = None,
    unused: bool | None = None,
) -> int:
    stmt = select(func.count(Form.id))
    stmt = _apply_form_filters(
        stmt,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=archived,
        created_by_user_id=created_by_user_id,
        unused=unused,
    )
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


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
    form = await get_by_id(session, form_id)
    if not form:
        return False
    form.archived = True
    await session.flush()
    return True


async def get_universal_for_org(session: AsyncSession, org_id: uuid.UUID) -> Form | None:
    stmt = (
        select(Form)
        .where(
            Form.organization_id == org_id,
            Form.is_universal.is_(True),
            Form.archived.is_(False),
        )
        .order_by(Form.created_at.asc())
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()
