"""admin: users.last_login_at and plan_requests

last_login_at is set at every sign-in and lets the administrator see who is still around.
plan_requests holds the requests for a paid plan that are activated by hand; the partial unique
index lets a person have only one request waiting at a time, whatever the parallel clicks.

Revision ID: 041_admin
Revises: 040_subscription_lifecycle
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "041_admin"
down_revision: Union[str, None] = "040_subscription_lifecycle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    # The admin table is sorted by registration date and by last sign-in
    op.create_index("ix_users_created_at", "users", ["created_at"])

    op.create_table(
        "plan_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plan_code", sa.String(32), nullable=False),
        sa.Column("billing_interval", sa.String(16), nullable=False),
        sa.Column("contact", sa.String(200), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column(
            "processed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_plan_requests_user_id", "plan_requests", ["user_id"])
    op.create_index(
        "ix_plan_requests_status_created_at", "plan_requests", ["status", "created_at"]
    )
    op.create_index(
        "uq_plan_requests_one_pending_per_user",
        "plan_requests",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_plan_requests_one_pending_per_user", table_name="plan_requests")
    op.drop_index("ix_plan_requests_status_created_at", table_name="plan_requests")
    op.drop_index("ix_plan_requests_user_id", table_name="plan_requests")
    op.drop_table("plan_requests")
    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_column("users", "last_login_at")
