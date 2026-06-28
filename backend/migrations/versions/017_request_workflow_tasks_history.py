"""request workflow: tasks, history, workflow_status columns

Revision ID: 017_request_workflow
Revises: 016_add_requests_deleted
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "017_request_workflow"
down_revision: Union[str, None] = "016_add_requests_deleted"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "requests",
        sa.Column("workflow_status", sa.String(length=32), nullable=False, server_default="new"),
    )
    op.add_column(
        "requests",
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="medium"),
    )
    op.add_column("requests", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("requests", sa.Column("responsible_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_requests_workflow_status", "requests", ["workflow_status"])
    op.create_index("ix_requests_responsible_user_id", "requests", ["responsible_user_id"])
    op.create_foreign_key(
        "fk_requests_responsible_user_id_users",
        "requests",
        "users",
        ["responsible_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Backfill workflow_status from legacy status
    op.execute(
        """
        UPDATE requests SET workflow_status = CASE
            WHEN deleted = true THEN 'archived'
            WHEN status = 'closed' THEN 'completed'
            WHEN status = 'assigned' THEN 'in_progress'
            ELSE 'new'
        END
        """
    )

    op.alter_column("requests", "workflow_status", server_default=None)
    op.alter_column("requests", "priority", server_default=None)

    op.create_table(
        "request_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="todo"),
        sa.Column("assignee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_request_tasks_request_id", "request_tasks", ["request_id"])
    op.create_index("ix_request_tasks_assignee_id", "request_tasks", ["assignee_id"])
    op.create_index("ix_request_tasks_status", "request_tasks", ["status"])
    op.alter_column("request_tasks", "status", server_default=None)
    op.alter_column("request_tasks", "priority", server_default=None)
    op.alter_column("request_tasks", "is_required", server_default=None)
    op.alter_column("request_tasks", "order_index", server_default=None)

    op.create_table(
        "request_history_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_request_history_events_request_id", "request_history_events", ["request_id"])
    op.create_index("ix_request_history_events_created_at", "request_history_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("request_history_events")
    op.drop_table("request_tasks")
    op.drop_constraint("fk_requests_responsible_user_id_users", "requests", type_="foreignkey")
    op.drop_index("ix_requests_responsible_user_id", table_name="requests")
    op.drop_index("ix_requests_workflow_status", table_name="requests")
    op.drop_column("requests", "responsible_user_id")
    op.drop_column("requests", "due_date")
    op.drop_column("requests", "priority")
    op.drop_column("requests", "workflow_status")
