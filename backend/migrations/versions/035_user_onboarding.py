"""user onboarding: first-visit questionnaire answers and the state of the guided tour

Accounts that already exist get a row with `dismissible` set, so they see the questionnaire once and
may close it; new accounts have no row and must answer.

Revision ID: 035_user_onboarding
Revises: 034_welcome_project
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "035_user_onboarding"
down_revision: Union[str, None] = "034_welcome_project"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_onboarding",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("occupation", sa.String(length=32), nullable=True),
        sa.Column("occupation_other", sa.String(length=200), nullable=True),
        sa.Column(
            "purposes",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("purpose_other", sa.String(length=200), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=True),
        sa.Column("source_other", sa.String(length=200), nullable=True),
        sa.Column("survey_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("survey_dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dismissible", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("tour_status", sa.String(length=16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("tour_step", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO user_onboarding (user_id, dismissible, created_at, updated_at)
            SELECT id, true, now(), now() FROM users
            """
        )
    )


def downgrade() -> None:
    op.drop_table("user_onboarding")
