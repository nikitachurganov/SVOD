import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.request_execution_event import RequestExecutionEvent
from app.models.request_stage import RequestStage


async def list_stages_for_request(session: AsyncSession, request_id: int) -> list[RequestStage]:
    stmt = (
        select(RequestStage)
        .where(RequestStage.request_id == request_id)
        .options(
            selectinload(RequestStage.assignee_internal_user),
            selectinload(RequestStage.assignee_external_contractor),
        )
        .order_by(RequestStage.sequence)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_stage(session: AsyncSession, stage_id: uuid.UUID) -> RequestStage | None:
    stmt = (
        select(RequestStage)
        .where(RequestStage.id == stage_id)
        .options(
            selectinload(RequestStage.assignee_internal_user),
            selectinload(RequestStage.assignee_external_contractor),
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def count_stages_for_request(session: AsyncSession, request_id: int) -> int:
    stmt = (
        select(func.count())
        .select_from(RequestStage)
        .where(RequestStage.request_id == request_id)
    )
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


async def max_sequence(session: AsyncSession, request_id: int) -> int:
    stmt = select(RequestStage.sequence).where(RequestStage.request_id == request_id)
    result = await session.execute(stmt)
    rows: Sequence[int] = result.scalars().all()
    return max(rows) if rows else 0


async def list_execution_events(
    session: AsyncSession, request_id: int, *, limit: int = 100
) -> list[RequestExecutionEvent]:
    stmt = (
        select(RequestExecutionEvent)
        .where(RequestExecutionEvent.request_id == request_id)
        .order_by(RequestExecutionEvent.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())
