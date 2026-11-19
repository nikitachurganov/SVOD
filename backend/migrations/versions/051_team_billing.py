"""team_billing: the plan, the balances and the rights of a team

A team owns its balances (docs/MONETIZATION_TEAM_SPEC.md): the free ordinary tokens, the quota of the
paid month and the pack tokens with no expiry. A payment now also remembers the team it was made for.

Revision ID: 051_team_billing
Revises: 050_drop_personal_workspace
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "051_team_billing"
down_revision: Union[str, None] = "050_drop_personal_workspace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "team_billing",
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("plan_code", sa.String(32), nullable=True),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("plan_tokens", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("purchased_tokens", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("permanent_tools_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("free_tokens", sa.BigInteger(), nullable=False, server_default="150000"),
        sa.Column("free_cycle_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.add_column(
        "payments",
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_payments_organization_id_created_at", "payments", ["organization_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_payments_organization_id_created_at", table_name="payments")
    op.drop_column("payments", "organization_id")
    op.drop_table("team_billing")
