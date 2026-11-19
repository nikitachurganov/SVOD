import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.constants.billing_plans import TEAM_FREE_TOKENS
from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class TeamBilling(Base):
    """What a team has bought and what is left of it (docs/MONETIZATION_TEAM_SPEC.md).

    One row per team, created on first use. Three balances live here and are spent only under a row
    lock (see team_billing_service): the free ordinary tokens of the current monthly cycle, the quota of
    the paid month and the pack tokens that never expire. The rights to the methodologies and the CSV
    come from ``permanent_tools_at``: they are set by the first successful pack and never taken back by
    a balance running out.
    """

    __tablename__ = "team_billing"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    # The running subscription (a key of TEAM_PLANS) and the paid month it covers; None: none
    plan_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Токены+ left of the quota of the paid month; burns when the month ends
    plan_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    # Токены+ of the packs of 99 ₽: no expiry, kept when a subscription ends or renews
    purchased_tokens: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    # The moment of the first successful pack: from then on all the methodologies and the CSV stay open
    permanent_tools_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The free ordinary tokens and the start of the monthly cycle they belong to
    free_tokens: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=TEAM_FREE_TOKENS, server_default=str(TEAM_FREE_TOKENS)
    )
    free_cycle_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )
