import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UsageCounter(Base):
    """How much of a metered limit the user has used in a billing period.

    A new period gets a new row, so counters reset without any scheduled job.
    """

    __tablename__ = "usage_counters"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    metric: Mapped[str] = mapped_column(String(32), primary_key=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
