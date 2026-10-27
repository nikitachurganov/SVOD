import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

PLAN_REQUEST_PENDING = "pending"
PLAN_REQUEST_APPROVED = "approved"
PLAN_REQUEST_REJECTED = "rejected"


class PlanRequest(Base):
    """A person's request for a paid plan, activated by an administrator after the payment."""

    __tablename__ = "plan_requests"
    __table_args__ = (
        Index("ix_plan_requests_user_id", "user_id"),
        Index("ix_plan_requests_status_created_at", "status", "created_at"),
        # A person has at most one request waiting; this also settles two parallel clicks
        Index(
            "uq_plan_requests_one_pending_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    plan_code: Mapped[str] = mapped_column(String(32), nullable=False)
    billing_interval: Mapped[str] = mapped_column(String(16), nullable=False)
    # How to reach the person about the payment: an email or a messenger handle
    contact: Mapped[str] = mapped_column(String(200), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=PLAN_REQUEST_PENDING, server_default=PLAN_REQUEST_PENDING
    )
    processed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The administrator's reason for a refusal or a note on the activation
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
