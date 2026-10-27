import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, false, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

PROVIDER_YOOKASSA = "yookassa"

# Created locally, the provider has not answered yet
PAYMENT_NEW = "new"
# The provider has the payment and waits for the person
PAYMENT_PENDING = "pending"
PAYMENT_SUCCEEDED = "succeeded"
PAYMENT_CANCELED = "canceled"
# The provider could not be reached or refused to create the payment
PAYMENT_FAILED = "failed"
# The provider says the money differs from what we asked for: nothing is granted, a human looks
PAYMENT_MISMATCH = "mismatch"

OPEN_STATUSES = (PAYMENT_NEW, PAYMENT_PENDING)


class Payment(Base):
    """One attempt to pay for a plan. Settled from the provider's own data, never from a notification."""

    __tablename__ = "payments"
    __table_args__ = (
        Index(
            "uq_payments_provider_payment_id",
            "provider",
            "provider_payment_id",
            unique=True,
            postgresql_where=text("provider_payment_id IS NOT NULL"),
        ),
        Index("uq_payments_idempotence_key", "idempotence_key", unique=True),
        Index("ix_payments_user_id_created_at", "user_id", "created_at"),
        Index("ix_payments_status_created_at", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # SET NULL: the record of the money outlives a deleted account
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    payer_email: Mapped[str] = mapped_column(String(320), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default=PROVIDER_YOOKASSA)
    provider_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Sent to the provider so that repeating the call never makes a second payment
    idempotence_key: Mapped[str] = mapped_column(String(64), nullable=False)
    plan_code: Mapped[str] = mapped_column(String(32), nullable=False)
    # month, year or one_off (the course-work pack)
    term: Mapped[str] = mapped_column(String(16), nullable=False)
    days: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_kopecks: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="RUB", server_default="RUB")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=PAYMENT_NEW)
    confirmation_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_test: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    refunded_kopecks: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # When the plan was extended for it: set once, so a repeated notification grants nothing twice
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
