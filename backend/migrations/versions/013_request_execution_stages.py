"""Request execution stages and events (multi-stage workflow).

Revision ID: 013_request_execution_stages
Revises: 012_ai_tz
Create Date: 2026-04-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "013_request_execution_stages"
down_revision: Union[str, None] = "012_ai_tz"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "request_stages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("assignee_kind", sa.String(length=20), nullable=True),
        sa.Column("assignee_internal_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assignee_external_contractor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("blocked_reason", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("result_summary", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("template_key", sa.String(length=120), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["assignee_internal_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["assignee_external_contractor_id"],
            ["external_contractors.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["completed_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_id", "sequence", name="uq_request_stages_request_sequence"),
    )
    op.create_index("ix_request_stages_request_id", "request_stages", ["request_id"])
    op.create_index(
        "ix_request_stages_assignee_internal_user_id",
        "request_stages",
        ["assignee_internal_user_id"],
    )
    op.create_index(
        "ix_request_stages_assignee_external_contractor_id",
        "request_stages",
        ["assignee_external_contractor_id"],
    )
    op.create_index("ix_request_stages_status", "request_stages", ["status"])

    op.create_check_constraint(
        "ck_request_stages_assignee_kind_values",
        "request_stages",
        "assignee_kind IS NULL OR assignee_kind IN ('internal', 'external', 'unassigned')",
    )
    op.create_check_constraint(
        "ck_request_stages_assignee_fk_consistency",
        "request_stages",
        "(assignee_kind IS NULL AND assignee_internal_user_id IS NULL "
        "AND assignee_external_contractor_id IS NULL) "
        "OR (assignee_kind = 'unassigned' AND assignee_internal_user_id IS NULL "
        "AND assignee_external_contractor_id IS NULL) "
        "OR (assignee_kind = 'internal' AND assignee_internal_user_id IS NOT NULL "
        "AND assignee_external_contractor_id IS NULL) "
        "OR (assignee_kind = 'external' AND assignee_external_contractor_id IS NOT NULL "
        "AND assignee_internal_user_id IS NULL)",
    )

    op.create_table(
        "request_execution_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("stage_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stage_id"], ["request_stages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_request_execution_events_request_id",
        "request_execution_events",
        ["request_id"],
    )
    op.create_index(
        "ix_request_execution_events_stage_id",
        "request_execution_events",
        ["stage_id"],
    )
    op.create_index(
        "ix_request_execution_events_created_at",
        "request_execution_events",
        ["created_at"],
    )

    op.add_column(
        "requests",
        sa.Column("execution_status", sa.String(length=32), nullable=True),
    )
    op.create_index("ix_requests_execution_status", "requests", ["execution_status"])

    op.execute(
        sa.text(
            """
            INSERT INTO request_stages (
                id, request_id, sequence, title, description,
                assignee_kind, assignee_internal_user_id, assignee_external_contractor_id,
                status, blocked_reason, started_at, completed_at, completed_by_user_id,
                result_summary, source, template_key, created_at, updated_at
            )
            SELECT
                gen_random_uuid(),
                r.id,
                1,
                'Исполнение',
                NULL,
                CASE
                    WHEN r.assigned_kind IS NULL THEN 'unassigned'
                    ELSE r.assigned_kind
                END,
                r.assigned_internal_user_id,
                r.assigned_external_contractor_id,
                CASE
                    WHEN r.status = 'closed' THEN 'done'
                    WHEN r.assigned_kind IS NOT NULL THEN 'in_progress'
                    ELSE 'pending'
                END,
                NULL,
                CASE
                    WHEN r.assigned_kind IS NOT NULL THEN r.created_at
                    ELSE NULL
                END,
                CASE
                    WHEN r.status = 'closed' THEN COALESCE(r.closed_at, r.updated_at)
                    ELSE NULL
                END,
                NULL,
                NULL,
                'import',
                NULL,
                r.created_at,
                r.updated_at
            FROM requests r;
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE requests r
            SET execution_status = sub.ex
            FROM (
                SELECT
                    rs.request_id AS rid,
                    CASE rs.status
                        WHEN 'done' THEN 'completed'
                        WHEN 'in_progress' THEN 'in_progress'
                        WHEN 'needs_review' THEN 'in_progress'
                        WHEN 'blocked' THEN 'blocked'
                        WHEN 'waiting_assignment' THEN 'waiting'
                        WHEN 'waiting_external' THEN 'waiting'
                        WHEN 'pending' THEN 'new'
                        WHEN 'cancelled' THEN 'new'
                        ELSE 'new'
                    END AS ex
                FROM request_stages rs
                WHERE rs.sequence = 1
            ) AS sub
            WHERE r.id = sub.rid;
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_requests_execution_status", table_name="requests")
    op.drop_column("requests", "execution_status")

    op.drop_index("ix_request_execution_events_created_at", table_name="request_execution_events")
    op.drop_index("ix_request_execution_events_stage_id", table_name="request_execution_events")
    op.drop_index("ix_request_execution_events_request_id", table_name="request_execution_events")
    op.drop_table("request_execution_events")

    op.drop_constraint("ck_request_stages_assignee_fk_consistency", "request_stages", type_="check")
    op.drop_constraint("ck_request_stages_assignee_kind_values", "request_stages", type_="check")
    op.drop_index("ix_request_stages_status", table_name="request_stages")
    op.drop_index("ix_request_stages_assignee_external_contractor_id", table_name="request_stages")
    op.drop_index("ix_request_stages_assignee_internal_user_id", table_name="request_stages")
    op.drop_index("ix_request_stages_request_id", table_name="request_stages")
    op.drop_table("request_stages")
