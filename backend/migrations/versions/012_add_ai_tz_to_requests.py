"""Add ai_tz JSONB to requests for generated technical specification.

Revision ID: 012_ai_tz
Revises: 011_performer_selection
Create Date: 2026-04-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "012_ai_tz"
down_revision: Union[str, None] = "011_performer_selection"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "requests",
        sa.Column("ai_tz", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("requests", "ai_tz")
