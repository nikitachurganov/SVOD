"""add stage specifications, handoff snapshots and artifact purpose

Revision ID: 022_stage_timeline_dossiers
Revises: 021_archive_deleted_requests
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "022_stage_timeline_dossiers"
down_revision: Union[str, None] = "021_archive_deleted_requests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "request_stage_artifacts",
        sa.Column("purpose", sa.String(length=16), nullable=False, server_default="result"),
    )
    op.create_check_constraint(
        "ck_request_stage_artifacts_purpose",
        "request_stage_artifacts",
        "purpose IN ('input', 'result')",
    )

    op.create_table(
        "request_stage_specifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("stage_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("source", sa.String(length=24), nullable=False, server_default="manual"),
        sa.Column("sections", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("generated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("confirmed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stage_id"], ["request_stages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["generated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["confirmed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("stage_id", "version", name="uq_request_stage_specifications_stage_version"),
    )
    op.create_index("ix_request_stage_specifications_request_id", "request_stage_specifications", ["request_id"])
    op.create_index("ix_request_stage_specifications_stage_id", "request_stage_specifications", ["stage_id"])

    op.create_table(
        "request_stage_handoffs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("stage_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("specification_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("specification_version", sa.Integer(), nullable=True),
        sa.Column("specification_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("assignee_kind", sa.String(length=20), nullable=False),
        sa.Column("assignee_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assignee_name", sa.String(length=500), nullable=False),
        sa.Column("assigned_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assigned_by_name", sa.String(length=500), nullable=False),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("materials_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stage_id"], ["request_stages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["specification_id"], ["request_stage_specifications.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_request_stage_handoffs_request_id", "request_stage_handoffs", ["request_id"])
    op.create_index("ix_request_stage_handoffs_stage_id", "request_stage_handoffs", ["stage_id"])


def downgrade() -> None:
    op.drop_index("ix_request_stage_handoffs_stage_id", table_name="request_stage_handoffs")
    op.drop_index("ix_request_stage_handoffs_request_id", table_name="request_stage_handoffs")
    op.drop_table("request_stage_handoffs")
    op.drop_index("ix_request_stage_specifications_stage_id", table_name="request_stage_specifications")
    op.drop_index("ix_request_stage_specifications_request_id", table_name="request_stage_specifications")
    op.drop_table("request_stage_specifications")
    op.drop_constraint("ck_request_stage_artifacts_purpose", "request_stage_artifacts", type_="check")
    op.drop_column("request_stage_artifacts", "purpose")
