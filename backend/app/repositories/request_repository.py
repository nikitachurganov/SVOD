import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.request import Request
from app.models.request_history_event import RequestHistoryEvent
from app.models.request_stage import RequestStage
from app.models.request_stage_handoff import RequestStageHandoff
from app.models.request_stage_specification import RequestStageSpecification
from app.models.request_task import RequestTask


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


def _apply_request_filters(
    stmt,
    *,
    organization_id: uuid.UUID | None = None,
    archived: bool | None = None,
    created_by_user_id: uuid.UUID | None = None,
    status: str | None = None,
    workflow_statuses: list[str] | None = None,
    organization_ids: list[uuid.UUID] | None = None,
    viewer_user_id: uuid.UUID | None = None,
    responsible_user_id: uuid.UUID | None = None,
    without_responsible: bool = False,
):
    if organization_id is not None:
        stmt = stmt.where(Request.organization_id == organization_id)
    if created_by_user_id is not None:
        stmt = stmt.where(Request.created_by_user_id == created_by_user_id)
    if organization_ids is not None:
        access_filters = [Request.organization_id.in_(organization_ids)]
        if viewer_user_id is not None:
            access_filters.append(
                and_(
                    Request.organization_id.is_(None),
                    Request.created_by_user_id == viewer_user_id,
                )
            )
        stmt = stmt.where(or_(*access_filters))

    if archived is True:
        stmt = stmt.where(Request.deleted == True)  # noqa: E712
    elif archived is False:
        stmt = stmt.where(Request.deleted == False)  # noqa: E712

    if status is not None:
        stmt = stmt.where(Request.status == status)
    if workflow_statuses:
        stmt = stmt.where(Request.workflow_status.in_(workflow_statuses))
    if responsible_user_id is not None:
        stmt = stmt.where(Request.responsible_user_id == responsible_user_id)
    if without_responsible:
        stmt = stmt.where(Request.responsible_user_id.is_(None))
    return stmt


async def get_all_filtered(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID | None = None,
    archived: bool | None = None,
    created_by_user_id: uuid.UUID | None = None,
    status: str | None = None,
    workflow_statuses: list[str] | None = None,
    organization_ids: list[uuid.UUID] | None = None,
    viewer_user_id: uuid.UUID | None = None,
    responsible_user_id: uuid.UUID | None = None,
    without_responsible: bool = False,
) -> list[Request]:
    stmt = select(Request).options(selectinload(Request.author))
    stmt = _apply_request_filters(
        stmt,
        organization_id=organization_id,
        archived=archived,
        created_by_user_id=created_by_user_id,
        status=status,
        workflow_statuses=workflow_statuses,
        organization_ids=organization_ids,
        viewer_user_id=viewer_user_id,
        responsible_user_id=responsible_user_id,
        without_responsible=without_responsible,
    )
    stmt = stmt.order_by(Request.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_involving_user(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    exclude_workflow_statuses: frozenset[str],
    exclude_stage_statuses: frozenset[str],
    limit: int,
) -> list[Request]:
    """Active requests where the user is the author, the responsible or an active stage assignee."""
    assigned_stage = (
        select(RequestStage.id)
        .where(
            RequestStage.request_id == Request.id,
            RequestStage.assignee_internal_user_id == user_id,
            RequestStage.status.notin_(exclude_stage_statuses),
        )
        .exists()
    )
    stmt = (
        select(Request)
        .where(
            Request.deleted.is_(False),
            Request.workflow_status.notin_(exclude_workflow_statuses),
            or_(
                Request.created_by_user_id == user_id,
                Request.responsible_user_id == user_id,
                assigned_stage,
            ),
        )
        .order_by(Request.updated_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def count_filtered(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID | None = None,
    archived: bool | None = None,
    created_by_user_id: uuid.UUID | None = None,
    status: str | None = None,
    workflow_statuses: list[str] | None = None,
    organization_ids: list[uuid.UUID] | None = None,
    viewer_user_id: uuid.UUID | None = None,
) -> int:
    stmt = select(func.count(Request.id))
    stmt = _apply_request_filters(
        stmt,
        organization_id=organization_id,
        archived=archived,
        created_by_user_id=created_by_user_id,
        status=status,
        workflow_statuses=workflow_statuses,
        organization_ids=organization_ids,
        viewer_user_id=viewer_user_id,
    )
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


async def get_by_id(session: AsyncSession, request_id: int) -> Request | None:
    stmt = (
        select(Request)
        .options(
            selectinload(Request.author),
            selectinload(Request.responsible_user),
            selectinload(Request.assigned_internal_user),
            selectinload(Request.assigned_external_contractor),
            selectinload(Request.stages).selectinload(RequestStage.assignee_internal_user),
            selectinload(Request.stages).selectinload(RequestStage.assignee_external_contractor),
            selectinload(Request.stages).selectinload(RequestStage.artifacts),
            selectinload(Request.stages).selectinload(RequestStage.specifications),
            selectinload(Request.stages).selectinload(RequestStage.handoffs),
            selectinload(Request.tasks).selectinload(RequestTask.assignee),
            selectinload(Request.tasks).selectinload(RequestTask.created_by),
            selectinload(Request.history_events).selectinload(RequestHistoryEvent.actor),
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
    req = await get_by_id(session, request_id)
    if not req:
        return False
    req.deleted = True
    await session.flush()
    return True


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
            Request.deleted.is_(False),
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
            Request.deleted.is_(False),
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
