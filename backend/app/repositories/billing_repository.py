import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import (
    PLAN_START,
    STATUS_ACTIVE,
    STATUS_PAST_DUE,
    STATUS_TRIALING,
)
from app.models.ai_usage_log import AIUsageLog
from app.models.subscription import Subscription, SubscriptionEvent
from app.models.usage_counter import UsageCounter


async def get_subscription(session: AsyncSession, user_id: uuid.UUID) -> Subscription | None:
    stmt = select(Subscription).where(Subscription.user_id == user_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create_subscription_if_missing(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    plan_code: str,
    status: str,
    billing_interval: str,
    period_start: datetime,
    period_end: datetime,
    now: datetime,
) -> uuid.UUID | None:
    """Insert the user's row unless a parallel request already did.

    Returns the new id, or None when the row existed (so the caller knows whether it created it).
    """
    stmt = (
        pg_insert(Subscription)
        .values(
            id=uuid.uuid4(),
            user_id=user_id,
            plan_code=plan_code,
            status=status,
            billing_interval=billing_interval,
            current_period_start=period_start,
            current_period_end=period_end,
            cancel_at_period_end=False,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_nothing(index_elements=["user_id"])
        .returning(Subscription.id)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def add_event(
    session: AsyncSession,
    *,
    subscription_id: uuid.UUID,
    kind: str,
    payload: dict[str, Any] | None = None,
    actor_user_id: uuid.UUID | None = None,
) -> SubscriptionEvent:
    row = SubscriptionEvent(
        subscription_id=subscription_id,
        kind=kind,
        payload=payload,
        actor_user_id=actor_user_id,
    )
    session.add(row)
    await session.flush()
    return row


async def get_usage(
    session: AsyncSession, user_id: uuid.UUID, period_start: datetime
) -> dict[str, int]:
    """Metered usage of one billing period: {metric: value}."""
    stmt = select(UsageCounter.metric, UsageCounter.value).where(
        UsageCounter.user_id == user_id, UsageCounter.period_start == period_start
    )
    result = await session.execute(stmt)
    return {metric: value for metric, value in result.all()}


async def reserve_usage(
    session: AsyncSession,
    user_id: uuid.UUID,
    metric: str,
    period_start: datetime,
    *,
    limit: int | None,
) -> int | None:
    """Add one to the counter and return the new value.

    With a limit the increase happens only if the result stays within it; None then means the
    limit was already reached. It is one statement, so parallel requests cannot overshoot.
    Without a limit (shadow mode) it always counts.
    """
    if limit is not None and limit < 1:
        # The first insert below has no condition, so a zero limit has to be refused here
        return None
    stmt = (
        pg_insert(UsageCounter)
        .values(user_id=user_id, metric=metric, period_start=period_start, value=1)
        .on_conflict_do_update(
            index_elements=["user_id", "metric", "period_start"],
            set_={"value": UsageCounter.value + 1},
            where=None if limit is None else UsageCounter.value + 1 <= limit,
        )
        .returning(UsageCounter.value)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def add_usage(
    session: AsyncSession, user_id: uuid.UUID, metric: str, period_start: datetime, amount: int
) -> int:
    """Add ``amount`` to the counter (tokens spent by an AI action) and return the new value."""
    stmt = (
        pg_insert(UsageCounter)
        .values(user_id=user_id, metric=metric, period_start=period_start, value=amount)
        .on_conflict_do_update(
            index_elements=["user_id", "metric", "period_start"],
            set_={"value": UsageCounter.value + amount},
        )
        .returning(UsageCounter.value)
    )
    result = await session.execute(stmt)
    return result.scalar_one()


async def release_usage(
    session: AsyncSession, user_id: uuid.UUID, metric: str, period_start: datetime
) -> None:
    """Give one unit back (an action that failed); never goes below zero."""
    stmt = (
        update(UsageCounter)
        .where(
            UsageCounter.user_id == user_id,
            UsageCounter.metric == metric,
            UsageCounter.period_start == period_start,
        )
        .values(value=func.greatest(UsageCounter.value - 1, 0))
    )
    await session.execute(stmt)


async def add_ai_usage_log(
    session: AsyncSession,
    *,
    user_id: uuid.UUID | None,
    survey_id: uuid.UUID | None,
    action: str,
    calls: int,
    model: str | None,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: Decimal,
    status: str,
) -> AIUsageLog:
    row = AIUsageLog(
        user_id=user_id,
        survey_id=survey_id,
        action=action,
        calls=calls,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cost_usd=cost_usd,
        status=status,
    )
    session.add(row)
    await session.flush()
    return row


async def sum_ai_cost_usd(
    session: AsyncSession, *, since: datetime, user_id: uuid.UUID | None = None
) -> Decimal:
    """What AI cost since the moment, for one user or (without user_id) for the whole service."""
    stmt = select(func.coalesce(func.sum(AIUsageLog.cost_usd), 0)).where(
        AIUsageLog.created_at >= since
    )
    if user_id is not None:
        stmt = stmt.where(AIUsageLog.user_id == user_id)
    result = await session.execute(stmt)
    return Decimal(str(result.scalar_one()))


_LIVE_STATUSES = (STATUS_ACTIVE, STATUS_TRIALING, STATUS_PAST_DUE)


def _worker_page(stmt, after_id: uuid.UUID | None, limit: int):
    """One row-batch for the worker, locked for it: a second worker passes over what is taken."""
    if after_id is not None:
        stmt = stmt.where(Subscription.id > after_id)
    return stmt.order_by(Subscription.id).limit(limit).with_for_update(skip_locked=True)


async def list_due_subscriptions(
    session: AsyncSession, now: datetime, *, after_id: uuid.UUID | None = None, limit: int = 1
) -> list[Subscription]:
    """Paid subscriptions whose period is over."""
    stmt = select(Subscription).where(
        Subscription.plan_code != PLAN_START,
        Subscription.status.in_(_LIVE_STATUSES),
        Subscription.current_period_end <= now,
    )
    result = await session.execute(_worker_page(stmt, after_id, limit))
    return list(result.scalars().all())


async def list_ending_trials(
    session: AsyncSession,
    now: datetime,
    until: datetime,
    *,
    after_id: uuid.UUID | None = None,
    limit: int = 1,
) -> list[Subscription]:
    stmt = select(Subscription).where(
        Subscription.status == STATUS_TRIALING,
        Subscription.trial_ends_at > now,
        Subscription.trial_ends_at <= until,
    )
    result = await session.execute(_worker_page(stmt, after_id, limit))
    return list(result.scalars().all())


async def list_ending_plans(
    session: AsyncSession,
    now: datetime,
    until: datetime,
    *,
    after_id: uuid.UUID | None = None,
    limit: int = 1,
) -> list[Subscription]:
    """Paid subscriptions (not trials) whose period ends soon."""
    stmt = select(Subscription).where(
        Subscription.plan_code != PLAN_START,
        Subscription.status == STATUS_ACTIVE,
        Subscription.current_period_end > now,
        Subscription.current_period_end <= until,
    )
    result = await session.execute(_worker_page(stmt, after_id, limit))
    return list(result.scalars().all())


async def has_event(
    session: AsyncSession,
    subscription_id: uuid.UUID,
    kind: str,
    match: dict[str, Any] | None = None,
) -> bool:
    """Whether the journal has such an event; ``match`` is a subset of its payload."""
    stmt = select(SubscriptionEvent.id).where(
        SubscriptionEvent.subscription_id == subscription_id, SubscriptionEvent.kind == kind
    )
    if match:
        stmt = stmt.where(SubscriptionEvent.payload.contains(match))
    result = await session.execute(stmt.limit(1))
    return result.first() is not None


async def list_events(
    session: AsyncSession, subscription_id: uuid.UUID, *, limit: int
) -> list[SubscriptionEvent]:
    """The newest events of the subscription first."""
    result = await session.execute(
        select(SubscriptionEvent)
        .where(SubscriptionEvent.subscription_id == subscription_id)
        .order_by(SubscriptionEvent.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def list_unsent_events(
    session: AsyncSession, kind: str, *, limit: int
) -> list[SubscriptionEvent]:
    """Events of the kind that no email was sent for yet (``sent`` is not set), locked for the worker."""
    stmt = (
        select(SubscriptionEvent)
        .where(SubscriptionEvent.kind == kind, ~SubscriptionEvent.payload.contains({"sent": True}))
        .order_by(SubscriptionEvent.created_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())
