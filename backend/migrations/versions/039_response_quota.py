"""response quota: survey_responses.locked

A response that arrives beyond the owner's monthly quota is kept but hidden (locked) until the
plan grows. Responses that exist now stay visible: the column starts as false for all of them.

Revision ID: 039_response_quota
Revises: 038_ai_quota
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "039_response_quota"
down_revision: Union[str, None] = "038_ai_quota"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "survey_responses",
        sa.Column("locked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "ix_survey_responses_survey_id_locked", "survey_responses", ["survey_id", "locked"]
    )


def downgrade() -> None:
    op.drop_index("ix_survey_responses_survey_id_locked", table_name="survey_responses")
    op.drop_column("survey_responses", "locked")
