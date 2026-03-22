"""Add ai_summary JSONB column to requests.

Revision ID: 008_add_ai_summary
Revises: 007_add_invited_user
Create Date: 2026-03-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "008_add_ai_summary"
down_revision: Union[str, None] = "007_add_invited_user"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "requests",
        sa.Column("ai_summary", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("requests", "ai_summary")
