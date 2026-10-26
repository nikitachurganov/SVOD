import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserOnboarding(Base):
    """What a person told us on the first visit (who they are, what for, where from) and the state of the tour.

    The row is created on the first answer. Accounts that existed before the questionnaire appeared get
    a row with `dismissible` set: they may close the questionnaire instead of answering it.
    """

    __tablename__ = "user_onboarding"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    occupation: Mapped[str | None] = mapped_column(String(32), nullable=True)
    occupation_other: Mapped[str | None] = mapped_column(String(200), nullable=True)
    purposes: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    purpose_other: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_other: Mapped[str | None] = mapped_column(String(200), nullable=True)
    survey_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    survey_dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dismissible: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # pending: not asked yet or postponed; accepted / declined: the answer to the offer; completed: finished
    tour_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default=text("'pending'")
    )
    tour_step: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
