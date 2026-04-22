import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Request(Base):
    __tablename__ = "requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    form_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("forms.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="open")
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    execution_status: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    form_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_tz: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    applicant_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    applicant_company: Mapped[str | None] = mapped_column(String(500), nullable=True)
    applicant_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    applicant_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    assigned_kind: Mapped[str | None] = mapped_column(String(20), nullable=True)
    assigned_internal_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assigned_external_contractor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("external_contractors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    form: Mapped["Form"] = relationship(back_populates="requests", lazy="selectin")  # noqa: F821
    author: Mapped["User | None"] = relationship(  # noqa: F821
        back_populates="created_requests",
        lazy="selectin",
        foreign_keys=[created_by_user_id],
        primaryjoin="Request.created_by_user_id == User.id",
    )
    files: Mapped[list["FormFile"]] = relationship(  # noqa: F821
        back_populates="request", lazy="selectin", cascade="all, delete-orphan"
    )
    assigned_internal_user: Mapped["User | None"] = relationship(  # noqa: F821
        foreign_keys=[assigned_internal_user_id],
        lazy="selectin",
        overlaps="author",
    )
    assigned_external_contractor: Mapped["ExternalContractor | None"] = relationship(  # noqa: F821
        foreign_keys=[assigned_external_contractor_id],
        lazy="selectin",
    )
    stages: Mapped[list["RequestStage"]] = relationship(  # noqa: F821
        back_populates="request",
        order_by="RequestStage.sequence",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    execution_events: Mapped[list["RequestExecutionEvent"]] = relationship(  # noqa: F821
        back_populates="request",
        lazy="selectin",
    )
