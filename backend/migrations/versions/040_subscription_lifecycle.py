"""subscription lifecycle: users.deletion_requested_at and two indexes for the worker

deletion_requested_at is set when a person with a running paid plan asks to delete the account:
it is deleted when the paid period ends. The partial index keeps the worker's lookup cheap, since
almost nobody is waiting for deletion. The second index serves the search for subscriptions
whose period is over.

Revision ID: 040_subscription_lifecycle
Revises: 039_response_quota
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "040_subscription_lifecycle"
down_revision: Union[str, None] = "039_response_quota"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("deletion_requested_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        "ix_users_deletion_requested_at",
        "users",
        ["deletion_requested_at"],
        postgresql_where=sa.text("deletion_requested_at IS NOT NULL"),
    )
    op.create_index(
        "ix_subscriptions_current_period_end", "subscriptions", ["current_period_end"]
    )


def downgrade() -> None:
    op.drop_index("ix_subscriptions_current_period_end", table_name="subscriptions")
    op.drop_index("ix_users_deletion_requested_at", table_name="users")
    op.drop_column("users", "deletion_requested_at")
