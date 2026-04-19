"""Add ai_analysis JSONB column to requests.

Revision ID: 010_add_ai_analysis
Revises: 009_public_links
Create Date: 2026-04-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "010_add_ai_analysis"
down_revision: Union[str, None] = "009_public_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "requests",
        sa.Column("ai_analysis", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("requests", "ai_analysis")
