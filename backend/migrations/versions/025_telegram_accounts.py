"""telegram account linking and notification delivery mark

Revision ID: 025_telegram_accounts
Revises: 024_join_requests
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "025_telegram_accounts"
down_revision: Union[str, None] = "024_join_requests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "telegram_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column(
            "current_organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("blocked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id", name="uq_telegram_accounts_user_id"),
        sa.UniqueConstraint("telegram_user_id", name="uq_telegram_accounts_telegram_user_id"),
    )

    op.create_table(
        "telegram_link_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("token_hash", name="uq_telegram_link_tokens_token_hash"),
    )
    op.create_index("ix_telegram_link_tokens_user_id", "telegram_link_tokens", ["user_id"])

    op.add_column("notifications", sa.Column("telegram_sent_at", sa.DateTime(timezone=True), nullable=True))
    # Outbox scan: undelivered notifications by age
    op.create_index(
        "ix_notifications_telegram_pending",
        "notifications",
        ["created_at"],
        postgresql_where=sa.text("telegram_sent_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_telegram_pending", table_name="notifications")
    op.drop_column("notifications", "telegram_sent_at")
    op.drop_index("ix_telegram_link_tokens_user_id", table_name="telegram_link_tokens")
    op.drop_table("telegram_link_tokens")
    op.drop_table("telegram_accounts")
