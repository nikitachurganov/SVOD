import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Reusable "join organization" link: people apply by it, the owner moderates requests
    join_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    join_link_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    owner: Mapped["User"] = relationship(  # noqa: F821
        back_populates="owned_organizations",
        lazy="selectin",
        foreign_keys=[owner_user_id],
    )
    members: Mapped[list["OrganizationMember"]] = relationship(
        back_populates="organization",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    invitations: Mapped[list["OrganizationInvitation"]] = relationship(
        back_populates="organization",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    external_contractors: Mapped[list["ExternalContractor"]] = relationship(  # noqa: F821
        back_populates="org",
        lazy="noload",
        cascade="all, delete-orphan",
    )


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_members_org_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_tag: Mapped[str] = mapped_column(String(50), nullable=False, default="member")
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    job_title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    specialization: Mapped[str | None] = mapped_column(Text, nullable=True)
    geography: Mapped[str | None] = mapped_column(String(300), nullable=True)

    organization: Mapped["Organization"] = relationship(
        back_populates="members", lazy="selectin"
    )
    user: Mapped["User"] = relationship(  # noqa: F821
        back_populates="organization_memberships", lazy="selectin"
    )


class OrganizationInvitation(Base):
    __tablename__ = "organization_invitations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    role_tag: Mapped[str] = mapped_column(String(50), nullable=False, default="member")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    # existing_user — in-app invitation; new_account — invitee activates a pre-created account by link
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="existing_user")
    # Member profile the owner filled in; copied to the membership on acceptance
    job_title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    specialization: Mapped[str | None] = mapped_column(Text, nullable=True)
    invite_code: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    invited_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    organization: Mapped["Organization"] = relationship(
        back_populates="invitations", lazy="selectin"
    )
    invited_by: Mapped["User | None"] = relationship(  # noqa: F821
        lazy="selectin", foreign_keys=[invited_by_user_id]
    )
    invited_user: Mapped["User | None"] = relationship(  # noqa: F821
        lazy="selectin", foreign_keys=[invited_user_id]
    )


class OrganizationJoinRequest(Base):
    """A person asked to join the organization by its join link; the owner approves or rejects."""

    __tablename__ = "organization_join_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # pending | approved | rejected | withdrawn
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    job_title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    specialization: Mapped[str | None] = mapped_column(Text, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    organization: Mapped["Organization"] = relationship(lazy="selectin")
    user: Mapped["User"] = relationship(lazy="selectin", foreign_keys=[user_id])  # noqa: F821
