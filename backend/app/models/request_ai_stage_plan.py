import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RequestAIStagePlan(Base):
    __tablename__ = "request_ai_stage_plans"
    __table_args__ = (UniqueConstraint("request_id", name="uq_request_ai_stage_plans_request"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    source_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    proposal: Mapped[dict] = mapped_column(JSONB, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    request: Mapped["Request"] = relationship(back_populates="ai_stage_plan")  # noqa: F821

