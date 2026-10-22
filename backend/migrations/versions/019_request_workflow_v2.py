"""request workflow v2: responsibility, artifacts, notifications and AI jobs

Revision ID: 019_request_workflow_v2
Revises: 018_public_request_metadata
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "019_request_workflow_v2"
down_revision: Union[str, None] = "018_public_request_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("request_stages", sa.Column("expected_result", sa.Text(), nullable=True))
    op.add_column(
        "request_stages", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index("ix_request_stages_due_date", "request_stages", ["due_date"])

    op.create_table(
        "request_stage_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("stage_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("object_key", sa.Text(), nullable=True),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("size", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.CheckConstraint("kind IN ('file', 'link')", name="ck_stage_artifacts_kind"),
        sa.CheckConstraint(
            "(kind = 'file' AND object_key IS NOT NULL) OR (kind = 'link' AND url IS NOT NULL)",
            name="ck_stage_artifacts_location",
        ),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stage_id"], ["request_stages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_request_stage_artifacts_request_id", "request_stage_artifacts", ["request_id"])
    op.create_index("ix_request_stage_artifacts_stage_id", "request_stage_artifacts", ["stage_id"])

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recipient_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("request_id", sa.Integer(), nullable=True),
        sa.Column("stage_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("unique_key", sa.String(length=255), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stage_id"], ["request_stages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("unique_key", name="uq_notifications_unique_key"),
    )
    op.create_index("ix_notifications_recipient_user_id", "notifications", ["recipient_user_id"])
    op.create_index("ix_notifications_organization_id", "notifications", ["organization_id"])
    op.create_index("ix_notifications_request_id", "notifications", ["request_id"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])

    op.create_table(
        "ai_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("result", postgresql.JSONB(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_jobs_request_id", "ai_jobs", ["request_id"])
    op.create_index("ix_ai_jobs_kind", "ai_jobs", ["kind"])
    op.create_index("ix_ai_jobs_status", "ai_jobs", ["status"])
    op.create_index("ix_ai_jobs_fingerprint", "ai_jobs", ["fingerprint"])
    op.create_index(
        "uq_ai_jobs_active_fingerprint",
        "ai_jobs",
        ["request_id", "kind", "fingerprint"],
        unique=True,
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )

    op.create_table(
        "request_ai_stage_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("source_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("proposal", postgresql.JSONB(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_id", name="uq_request_ai_stage_plans_request"),
    )
    op.create_index("ix_request_ai_stage_plans_request_id", "request_ai_stage_plans", ["request_id"])

    op.execute(
        """
        UPDATE requests r
        SET responsible_user_id = o.owner_user_id
        FROM organizations o
        WHERE r.organization_id = o.id AND r.responsible_user_id IS NULL
        """
    )
    op.execute("UPDATE requests SET workflow_status = 'planning' WHERE workflow_status = 'triage'")
    op.execute("UPDATE requests SET workflow_status = 'completed' WHERE workflow_status = 'review'")
    op.execute("UPDATE requests SET workflow_status = 'closed' WHERE workflow_status = 'completed' AND status = 'closed'")
    op.execute("UPDATE request_stages SET status = 'in_progress' WHERE status = 'needs_review'")


def downgrade() -> None:
    op.drop_table("request_ai_stage_plans")
    op.drop_index("uq_ai_jobs_active_fingerprint", table_name="ai_jobs")
    op.drop_table("ai_jobs")
    op.drop_table("notifications")
    op.drop_table("request_stage_artifacts")
    op.drop_index("ix_request_stages_due_date", table_name="request_stages")
    op.drop_column("request_stages", "due_date")
    op.drop_column("request_stages", "expected_result")

