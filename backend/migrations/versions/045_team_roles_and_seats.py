"""team roles and seats: owner / admin / editor / reader, a seat count on the subscription

* organization_members and organization_invitations: the legacy tag "member" becomes "editor"
  (the old teams keep working as they did); new columns for a personal Токены+ limit of a member
  and for per-member permission overrides;
* subscriptions: the organization the plan belongs to (filled for personal workspaces now, the
  rest moves with the payment stage), the number of paid seats, the one-time window in which a
  removed seat can be restored at the bundle price, the moment of the first payment.

Revision ID: 045_team_roles_and_seats
Revises: 044_landing_demo_drafts
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "045_team_roles_and_seats"
down_revision: Union[str, None] = "044_landing_demo_drafts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE organization_members SET role_tag = 'editor' WHERE role_tag = 'member'")
    op.execute("UPDATE organization_invitations SET role_tag = 'editor' WHERE role_tag = 'member'")

    # NULL limit: the member spends from the shared pool of the team
    op.add_column(
        "organization_members", sa.Column("token_plus_limit", sa.BigInteger(), nullable=True)
    )
    op.add_column(
        "organization_members",
        sa.Column("token_plus_used", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.add_column(
        "organization_members",
        sa.Column("custom_permissions", postgresql.JSONB(), nullable=True),
    )

    op.add_column(
        "subscriptions",
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "subscriptions",
        sa.Column("seats_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "subscriptions", sa.Column("seat_window_ends_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "subscriptions", sa.Column("first_paid_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        "uq_subscriptions_organization_id",
        "subscriptions",
        ["organization_id"],
        unique=True,
        postgresql_where=sa.text("organization_id IS NOT NULL"),
    )
    # A personal workspace is paid by its owner: link the plan to it
    op.execute(
        """
        UPDATE subscriptions s
        SET organization_id = o.id
        FROM organizations o
        WHERE o.owner_user_id = s.user_id AND o.is_personal IS TRUE
        """
    )


def downgrade() -> None:
    op.drop_index("uq_subscriptions_organization_id", table_name="subscriptions")
    op.drop_column("subscriptions", "first_paid_at")
    op.drop_column("subscriptions", "seat_window_ends_at")
    op.drop_column("subscriptions", "seats_count")
    op.drop_column("subscriptions", "organization_id")
    op.drop_column("organization_members", "custom_permissions")
    op.drop_column("organization_members", "token_plus_used")
    op.drop_column("organization_members", "token_plus_limit")
    op.execute("UPDATE organization_invitations SET role_tag = 'member' WHERE role_tag = 'editor'")
    op.execute("UPDATE organization_members SET role_tag = 'member' WHERE role_tag = 'editor'")
