import uuid
from datetime import datetime

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan_request import PLAN_REQUEST_PENDING, PlanRequest
from app.models.user import User


async def create_if_none_pending(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    plan_code: str,
    billing_interval: str,
    contact: str,
    comment: str | None,
    now: datetime,
) -> PlanRequest | None:
    """Add the request unless the person already has one waiting; None then.

    One statement against the partial unique index, so two parallel clicks make one request.
    """
    new_id = uuid.uuid4()
    stmt = (
        pg_insert(PlanRequest)
        .values(
            id=new_id,
            user_id=user_id,
            plan_code=plan_code,
            billing_interval=billing_interval,
            contact=contact,
            comment=comment,
            status=PLAN_REQUEST_PENDING,
            created_at=now,
        )
        .on_conflict_do_nothing(
            index_elements=["user_id"], index_where=text("status = 'pending'")
        )
        .returning(PlanRequest.id)
    )
    inserted = (await session.execute(stmt)).scalar_one_or_none()
    if inserted is None:
        return None
    return await get_by_id(session, inserted)


async def get_by_id(
    session: AsyncSession, request_id: uuid.UUID, *, for_update: bool = False
) -> PlanRequest | None:
    stmt = select(PlanRequest).where(PlanRequest.id == request_id)
    if for_update:
        stmt = stmt.with_for_update()
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_pending_for_user(session: AsyncSession, user_id: uuid.UUID) -> PlanRequest | None:
    stmt = select(PlanRequest).where(
        PlanRequest.user_id == user_id, PlanRequest.status == PLAN_REQUEST_PENDING
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_for_user(
    session: AsyncSession, user_id: uuid.UUID, *, limit: int
) -> list[PlanRequest]:
    result = await session.execute(
        select(PlanRequest)
        .where(PlanRequest.user_id == user_id)
        .order_by(PlanRequest.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def list_requests(
    session: AsyncSession, *, status: str | None, offset: int, limit: int
) -> tuple[list[tuple[PlanRequest, User]], int]:
    """Requests with their authors, the oldest waiting first and the newest decided first."""
    base = select(PlanRequest, User).join(User, User.id == PlanRequest.user_id)
    count = select(func.count(PlanRequest.id))
    if status is not None:
        base = base.where(PlanRequest.status == status)
        count = count.where(PlanRequest.status == status)
    # Waiting requests are a queue (oldest first); the decided ones are a history (newest first)
    order = (
        PlanRequest.created_at.asc()
        if status == PLAN_REQUEST_PENDING
        else PlanRequest.created_at.desc()
    )
    rows = (await session.execute(base.order_by(order).offset(offset).limit(limit))).all()
    total = int((await session.execute(count)).scalar_one() or 0)
    return [(request, user) for request, user in rows], total


async def count_pending(session: AsyncSession) -> int:
    result = await session.execute(
        select(func.count(PlanRequest.id)).where(PlanRequest.status == PLAN_REQUEST_PENDING)
    )
    return int(result.scalar_one() or 0)
