"""cached AI summary of survey results

Revision ID: 029_survey_ai_summary
Revises: 028_surveys
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "029_survey_ai_summary"
down_revision: Union[str, None] = "028_surveys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("surveys", sa.Column("ai_summary", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("surveys", "ai_summary")
