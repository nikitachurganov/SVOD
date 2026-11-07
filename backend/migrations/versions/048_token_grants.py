"""token_grants: blocks of Токены+ with their own expiry (the extra pack, bonuses)

An extra pack (1 million for 300 ₽, 90 days) is spent after the monthly quota of the team is used
up (docs/TARIFFS_FINAL.md section 5). Each grant keeps its amount, the spent part and its expiry;
a refund revokes it.

Revision ID: 048_token_grants
Revises: 047_checkout_seats
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "048_token_grants"
down_revision: Union[str, None] = "047_checkout_seats"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "token_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("used", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "payment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
    )
    op.create_index("ix_token_grants_user_id_expires_at", "token_grants", ["user_id", "expires_at"])
    op.create_index(
        "uq_token_grants_payment_id",
        "token_grants",
        ["payment_id"],
        unique=True,
        postgresql_where=sa.text("payment_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_token_grants_payment_id", table_name="token_grants")
    op.drop_index("ix_token_grants_user_id_expires_at", table_name="token_grants")
    op.drop_table("token_grants")
