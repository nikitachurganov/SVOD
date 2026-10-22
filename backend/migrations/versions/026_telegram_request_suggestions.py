"""request drafts prepared by the Telegram bot

Revision ID: 026_telegram_request_suggestions
Revises: 025_telegram_accounts
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "026_telegram_request_suggestions"
down_revision: Union[str, None] = "025_telegram_accounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "telegram_request_suggestions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_kind", sa.String(length=16), nullable=False),
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True),
        sa.Column("chat_title", sa.String(length=255), nullable=True),
        sa.Column(
            "initiator_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("transcript", postgresql.JSONB(), nullable=True),
        sa.Column("attachments", postgresql.JSONB(), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column(
            "form_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("forms.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("form_name", sa.String(length=500), nullable=True),
        sa.Column("data", postgresql.JSONB(), nullable=True),
        sa.Column("form_snapshot", postgresql.JSONB(), nullable=True),
        sa.Column("missing_required", postgresql.JSONB(), nullable=True),
        sa.Column("form_choices", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column(
            "request_id",
            sa.Integer(),
            sa.ForeignKey("requests.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("card_chat_id", sa.BigInteger(), nullable=True),
        sa.Column("card_message_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "decided_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "source_kind IN ('private', 'group')",
            name="ck_telegram_request_suggestions_source_kind",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'created', 'dismissed', 'expired')",
            name="ck_telegram_request_suggestions_status",
        ),
        sa.UniqueConstraint("request_id", name="uq_telegram_request_suggestions_request_id"),
    )
    op.create_index(
        "ix_telegram_request_suggestions_organization_id",
        "telegram_request_suggestions",
        ["organization_id"],
    )
    op.create_index(
        "ix_telegram_request_suggestions_telegram_chat_id",
        "telegram_request_suggestions",
        ["telegram_chat_id"],
    )
    op.create_index(
        "ix_telegram_request_suggestions_status",
        "telegram_request_suggestions",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_telegram_request_suggestions_status", table_name="telegram_request_suggestions")
    op.drop_index("ix_telegram_request_suggestions_telegram_chat_id", table_name="telegram_request_suggestions")
    op.drop_index("ix_telegram_request_suggestions_organization_id", table_name="telegram_request_suggestions")
    op.drop_table("telegram_request_suggestions")
