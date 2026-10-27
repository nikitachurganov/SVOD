"""AI quota: users.ai_enabled and an index for the service-wide spending cap

Existing users keep AI switched on. The index serves the 24-hour sum over the whole usage log.

Revision ID: 038_ai_quota
Revises: 037_billing
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "038_ai_quota"
down_revision: Union[str, None] = "037_billing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("ai_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_ai_usage_log_created_at", "ai_usage_log", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_usage_log_created_at", table_name="ai_usage_log")
    op.drop_column("users", "ai_enabled")
