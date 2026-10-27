"""payments: online payments through YooKassa

One row per attempt to pay. The row is written before the provider is called (with the key that makes
the call safe to repeat) and is settled from the provider's own data, never from what a notification
claims. user_id is SET NULL: the money record outlives a deleted account, the payer's email is kept.

Revision ID: 042_payments
Revises: 041_admin
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "042_payments"
down_revision: Union[str, None] = "041_admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("payer_email", sa.String(320), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_payment_id", sa.String(64), nullable=True),
        sa.Column("idempotence_key", sa.String(64), nullable=False),
        sa.Column("plan_code", sa.String(32), nullable=False),
        sa.Column("term", sa.String(16), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("amount_kopecks", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="RUB"),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("confirmation_url", sa.Text(), nullable=True),
        sa.Column("failure_reason", sa.String(100), nullable=True),
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("refunded_kopecks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
    )
    # A notification is matched to its row by the provider's id; the id must never repeat
    op.create_index(
        "uq_payments_provider_payment_id",
        "payments",
        ["provider", "provider_payment_id"],
        unique=True,
        postgresql_where=sa.text("provider_payment_id IS NOT NULL"),
    )
    op.create_index("uq_payments_idempotence_key", "payments", ["idempotence_key"], unique=True)
    op.create_index("ix_payments_user_id_created_at", "payments", ["user_id", "created_at"])
    # The worker settles payments that are still open
    op.create_index("ix_payments_status_created_at", "payments", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_payments_status_created_at", table_name="payments")
    op.drop_index("ix_payments_user_id_created_at", table_name="payments")
    op.drop_index("uq_payments_idempotence_key", table_name="payments")
    op.drop_index("uq_payments_provider_payment_id", table_name="payments")
    op.drop_table("payments")
