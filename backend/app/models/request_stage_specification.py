import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RequestStageSpecification(Base):
    """An immutable revision of the technical specification for one stage."""

    __tablename__ = "request_stage_specifications"
    __table_args__ = (
        UniqueConstraint("stage_id", "version", name="uq_request_stage_specifications_stage_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("request_stages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="manual")
    sections: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    generated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    confirmed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    stage: Mapped["RequestStage"] = relationship(back_populates="specifications")  # noqa: F821
