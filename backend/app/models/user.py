import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, String, Text, text, true
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # The worker looks for accounts waiting to be deleted; almost nobody is one
        Index(
            "ix_users_deletion_requested_at",
            "deletion_requested_at",
            postgresql_where=text("deletion_requested_at IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Deprecated compatibility column; generated from split name fields.
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str] = mapped_column(
        String(320), nullable=False, unique=True, index=True
    )
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # An administrator can switch AI off for one account (abuse, a dispute); independent of the plan
    ai_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    # When the person confirmed the mailbox by a link from an email; None — not confirmed yet
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Deletion was asked for while a paid plan is running: the account is deleted when that paid
    # period ends (see account_deletion_service). None — no deletion is planned.
    deletion_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # The last successful sign-in by password (a session that is only renewed does not count)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    created_forms: Mapped[list["Form"]] = relationship(  # noqa: F821
        back_populates="author", lazy="selectin"
    )
    created_requests: Mapped[list["Request"]] = relationship(  # noqa: F821
        back_populates="author",
        lazy="selectin",
        primaryjoin="User.id == Request.created_by_user_id",
        foreign_keys="[Request.created_by_user_id]",
    )
    owned_organizations: Mapped[list["Organization"]] = relationship(  # noqa: F821
        back_populates="owner",
        lazy="noload",
        foreign_keys="[Organization.owner_user_id]",
    )
    organization_memberships: Mapped[list["OrganizationMember"]] = relationship(  # noqa: F821
        back_populates="user", lazy="noload"
    )
