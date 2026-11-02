import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LandingDemoDraft(Base):
    """A survey the AI built for an anonymous visitor of the landing, until they take it into the service."""

    __tablename__ = "landing_demo_drafts"

    # The token of the link «continue in the service»; whoever has it may take the draft
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    pages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    methodology_meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True
    )
    # Set once the draft became a survey: the link then only leads to that survey of that account
    survey_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("surveys.id", ondelete="SET NULL"), nullable=True
    )
    claimed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
