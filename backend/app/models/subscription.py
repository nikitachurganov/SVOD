import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.constants.billing_plans import INTERVAL_NONE, PLAN_START, STATUS_ACTIVE
from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Subscription(Base):
    """The user's current plan: one row per user, the history lives in subscription_events."""

    __tablename__ = "subscriptions"
    # The worker looks for subscriptions whose period is over
    __table_args__ = (Index("ix_subscriptions_current_period_end", "current_period_end"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    plan_code: Mapped[str] = mapped_column(String(32), nullable=False, default=PLAN_START)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=STATUS_ACTIVE)
    billing_interval: Mapped[str] = mapped_column(
        String(16), nullable=False, default=INTERVAL_NONE
    )
    current_period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The trial is given once per user
    trial_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    provider_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_method_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Individual limits set by an administrator, e.g. {"ai_actions_per_period": 500}
    limit_overrides: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )


class SubscriptionEvent(Base):
    """Journal of everything that happened to a subscription (support, payment disputes, churn)."""

    __tablename__ = "subscription_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Who did it: the user, an administrator; empty for the system
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
