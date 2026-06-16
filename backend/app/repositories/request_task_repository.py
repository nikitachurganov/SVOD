import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.request_task import RequestTask


async def list_tasks_for_request(
    session: AsyncSession, request_id: int
) -> list[RequestTask]:
    stmt = (
        select(RequestTask)
        .options(
            selectinload(RequestTask.assignee),
            selectinload(RequestTask.created_by),
        )
        .where(RequestTask.request_id == request_id)
        .order_by(RequestTask.order_index.asc(), RequestTask.created_at.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_task_by_id(
    session: AsyncSession, request_id: int, task_id: uuid.UUID
) -> RequestTask | None:
    stmt = (
        select(RequestTask)
        .options(
            selectinload(RequestTask.assignee),
            selectinload(RequestTask.created_by),
        )
        .where(RequestTask.request_id == request_id, RequestTask.id == task_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create_task(session: AsyncSession, task: RequestTask) -> RequestTask:
    session.add(task)
    await session.flush()
    await session.refresh(task, attribute_names=["assignee", "created_by"])
    return task


async def update_task(session: AsyncSession, task: RequestTask) -> RequestTask:
    await session.flush()
    await session.refresh(task, attribute_names=["assignee", "created_by"])
    return task


async def delete_task(
    session: AsyncSession, request_id: int, task_id: uuid.UUID
) -> bool:
    stmt = delete(RequestTask).where(
        RequestTask.request_id == request_id,
        RequestTask.id == task_id,
    )
    result = await session.execute(stmt)
    return result.rowcount > 0


async def next_order_index(session: AsyncSession, request_id: int) -> int:
    stmt = select(func.coalesce(func.max(RequestTask.order_index), -1)).where(
        RequestTask.request_id == request_id
    )
    result = await session.execute(stmt)
    return int(result.scalar_one()) + 1
