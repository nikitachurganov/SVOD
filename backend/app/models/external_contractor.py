import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ExternalContractor(Base):
    __tablename__ = "external_contractors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(500), nullable=False)
    organization: Mapped[str | None] = mapped_column(String(500), nullable=True)
    specialization: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[str | None] = mapped_column(String(300), nullable=True)
    geography: Mapped[str | None] = mapped_column(String(300), nullable=True)
    contact_kind: Mapped[str | None] = mapped_column(String(50), nullable=True)
    contact_value: Mapped[str | None] = mapped_column(String(500), nullable=True)
    rating: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    org: Mapped["Organization"] = relationship(  # noqa: F821
        back_populates="external_contractors", lazy="selectin"
    )
