import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserIdentity(Base):
    """An account of the person at an outside sign-in provider (Yandex ID)."""

    __tablename__ = "user_identities"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id", name="uq_user_identities_provider_user"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # "yandex"
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    # The provider's own stable id of the person (not the email, which can change)
    provider_user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # The mailbox the provider reported at the first sign-in; informational only
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
