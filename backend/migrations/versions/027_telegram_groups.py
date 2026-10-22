"""telegram group chats connected to organizations and their stored messages

Revision ID: 027_telegram_groups
Revises: 026_telegram_request_suggestions
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "027_telegram_groups"
down_revision: Union[str, None] = "026_telegram_request_suggestions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "telegram_chats",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column(
            "connected_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_analyzed_message_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("chat_id", name="uq_telegram_chats_chat_id"),
    )
    op.create_index("ix_telegram_chats_organization_id", "telegram_chats", ["organization_id"])

    op.create_table(
        "telegram_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("chat_id", sa.BigInteger(), nullable=False),
        sa.Column("message_id", sa.BigInteger(), nullable=False),
        sa.Column("from_telegram_user_id", sa.BigInteger(), nullable=True),
        sa.Column("from_name", sa.String(length=255), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("reply_to_message_id", sa.BigInteger(), nullable=True),
        sa.Column("attachments", postgresql.JSONB(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("chat_id", "message_id", name="uq_telegram_messages_chat_message"),
    )
    op.create_index("ix_telegram_messages_sent_at", "telegram_messages", ["sent_at"])


def downgrade() -> None:
    op.drop_index("ix_telegram_messages_sent_at", table_name="telegram_messages")
    op.drop_table("telegram_messages")
    op.drop_index("ix_telegram_chats_organization_id", table_name="telegram_chats")
    op.drop_table("telegram_chats")
