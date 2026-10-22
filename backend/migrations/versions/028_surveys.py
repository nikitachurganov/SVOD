"""surveys and survey responses

Revision ID: 028_surveys
Revises: 027_telegram_groups
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "028_surveys"
down_revision: Union[str, None] = "027_telegram_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "surveys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "pages",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("methodology_meta", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("public_token", sa.String(length=64), nullable=False),
        sa.Column("anonymous", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_surveys_organization_id", "surveys", ["organization_id"])
    op.create_index("ix_surveys_created_by_user_id", "surveys", ["created_by_user_id"])
    op.create_index("ix_surveys_status", "surveys", ["status"])
    op.create_index("ix_surveys_public_token", "surveys", ["public_token"], unique=True)

    op.create_table(
        "survey_responses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "survey_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("surveys.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "answers",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "schema_snapshot",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("quality_flags", postgresql.JSONB(), nullable=True),
        sa.Column("respondent_meta", postgresql.JSONB(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_survey_responses_survey_id", "survey_responses", ["survey_id"])


def downgrade() -> None:
    op.drop_index("ix_survey_responses_survey_id", table_name="survey_responses")
    op.drop_table("survey_responses")
    op.drop_index("ix_surveys_public_token", table_name="surveys")
    op.drop_index("ix_surveys_status", table_name="surveys")
    op.drop_index("ix_surveys_created_by_user_id", table_name="surveys")
    op.drop_index("ix_surveys_organization_id", table_name="surveys")
    op.drop_table("surveys")
