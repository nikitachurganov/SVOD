import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import (
    OPEN_STATUSES,
    PAYMENT_PENDING,
    PAYMENT_SUCCEEDED,
    Payment,
)


async def add(session: AsyncSession, payment: Payment) -> Payment:
    session.add(payment)
    await session.flush()
    return payment


async def get_by_id(
    session: AsyncSession, payment_id: uuid.UUID, *, for_update: bool = False
) -> Payment | None:
    stmt = select(Payment).where(Payment.id == payment_id)
    if for_update:
        stmt = stmt.with_for_update()
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_by_provider_id(
    session: AsyncSession, provider: str, provider_payment_id: str, *, for_update: bool = False
) -> Payment | None:
    """The row of the provider's payment; the lock makes a second notification wait for the first."""
    stmt = select(Payment).where(
        Payment.provider == provider, Payment.provider_payment_id == provider_payment_id
    )
    if for_update:
        stmt = stmt.with_for_update()
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_for_user(
    session: AsyncSession, user_id: uuid.UUID, payment_id: uuid.UUID
) -> Payment | None:
    stmt = select(Payment).where(Payment.id == payment_id, Payment.user_id == user_id)
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_for_user(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    limit: int,
    exclude_statuses: tuple[str, ...] = (),
) -> list[Payment]:
    stmt = select(Payment).where(Payment.user_id == user_id)
    if exclude_statuses:
        stmt = stmt.where(Payment.status.not_in(exclude_statuses))
    result = await session.execute(stmt.order_by(Payment.created_at.desc()).limit(limit))
    return list(result.scalars().all())


async def find_open_checkout(
    session: AsyncSession, user_id: uuid.UUID, term: str, *, since: datetime
) -> Payment | None:
    """A payment of this person for this term that is still waiting for them, so a second click
    on «Оплатить» returns the same page instead of making another payment."""
    stmt = (
        select(Payment)
        .where(
            Payment.user_id == user_id,
            Payment.term == term,
            Payment.status == PAYMENT_PENDING,
            Payment.confirmation_url.is_not(None),
            Payment.created_at >= since,
        )
        .order_by(Payment.created_at.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_open_ids(
    session: AsyncSession, *, older_than: datetime, newer_than: datetime, limit: int
) -> list[uuid.UUID]:
    """Payments that were not settled by a notification: the worker asks the provider about them."""
    result = await session.execute(
        select(Payment.id)
        .where(
            Payment.status.in_(OPEN_STATUSES),
            Payment.created_at <= older_than,
            Payment.created_at >= newer_than,
        )
        .order_by(Payment.created_at)
        .limit(limit)
    )
    return list(result.scalars().all())


async def sum_received(session: AsyncSession, *, since: datetime) -> int:
    """What came in since the moment, refunds taken off, in kopecks; test payments are not money."""
    result = await session.execute(
        select(func.coalesce(func.sum(Payment.amount_kopecks - Payment.refunded_kopecks), 0)).where(
            Payment.status == PAYMENT_SUCCEEDED,
            Payment.is_test.is_(False),
            Payment.paid_at >= since,
        )
    )
    return int(result.scalar_one() or 0)
