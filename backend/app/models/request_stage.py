import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.constants.request_execution import STAGE_SOURCE_MANUAL, STAGE_PENDING


class RequestStage(Base):
    __tablename__ = "request_stages"
    __table_args__ = (
        UniqueConstraint("request_id", "sequence", name="uq_request_stages_request_sequence"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    assignee_kind: Mapped[str | None] = mapped_column(String(20), nullable=True)
    assignee_internal_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assignee_external_contractor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("external_contractors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    status: Mapped[str] = mapped_column(String(32), nullable=False, default=STAGE_PENDING)
    blocked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    source: Mapped[str] = mapped_column(String(32), nullable=False, default=STAGE_SOURCE_MANUAL)
    template_key: Mapped[str | None] = mapped_column(String(120), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    request: Mapped["Request"] = relationship(back_populates="stages")  # noqa: F821
    assignee_internal_user: Mapped["User | None"] = relationship(  # noqa: F821
        foreign_keys=[assignee_internal_user_id],
        lazy="selectin",
        overlaps="assignee_external_contractor",
    )
    assignee_external_contractor: Mapped["ExternalContractor | None"] = relationship(  # noqa: F821
        foreign_keys=[assignee_external_contractor_id],
        lazy="selectin",
    )
