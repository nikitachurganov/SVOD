import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RequestStageHandoff(Base):
    """Immutable delivery package used when a stage is assigned or reassigned."""

    __tablename__ = "request_stage_handoffs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("request_stages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    specification_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("request_stage_specifications.id", ondelete="SET NULL"), nullable=True
    )
    specification_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    specification_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    assignee_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    assignee_name: Mapped[str] = mapped_column(String(500), nullable=False)
    assigned_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    assigned_by_name: Mapped[str] = mapped_column(String(500), nullable=False)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    materials_snapshot: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    stage: Mapped["RequestStage"] = relationship(back_populates="handoffs")  # noqa: F821
