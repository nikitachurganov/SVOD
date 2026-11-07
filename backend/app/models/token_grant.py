import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Токены+ bought as an extra pack (1 million for 300 ₽, 90 days)
GRANT_ADDON = "addon"
# Токены+ given as a bonus (a referral, an operator), 90 days
GRANT_BONUS = "bonus"


class TokenGrant(Base):
    """A block of Токены+ with its own expiry, spent after the monthly quota is used up.

    The grant belongs to the person whose counter the AI is charged to (the owner of the team pool).
    The spent part is ``used``; a revoked grant (a refund) or an expired one gives nothing.
    """

    __tablename__ = "token_grants"
    __table_args__ = (
        Index("ix_token_grants_user_id_expires_at", "user_id", "expires_at"),
        Index(
            "uq_token_grants_payment_id",
            "payment_id",
            unique=True,
            postgresql_where=text("payment_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    used: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payments.id", ondelete="SET NULL"), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
    )
