import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.request_history_event import RequestHistoryEvent


async def list_history_for_request(
    session: AsyncSession, request_id: int, *, limit: int = 100
) -> list[RequestHistoryEvent]:
    stmt = (
        select(RequestHistoryEvent)
        .options(selectinload(RequestHistoryEvent.actor))
        .where(RequestHistoryEvent.request_id == request_id)
        .order_by(RequestHistoryEvent.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def append_history(
    session: AsyncSession,
    *,
    request_id: int,
    actor_id: uuid.UUID | None,
    event_type: str,
    payload: dict | None = None,
) -> RequestHistoryEvent:
    event = RequestHistoryEvent(
        request_id=request_id,
        actor_id=actor_id,
        type=event_type,
        payload=payload,
    )
    session.add(event)
    await session.flush()
    await session.refresh(event, attribute_names=["actor"])
    return event
