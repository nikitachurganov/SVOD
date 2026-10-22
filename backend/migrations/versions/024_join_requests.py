"""organization join link and join requests (moderated by the owner)

Revision ID: 024_join_requests
Revises: 023_account_invitations
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "024_join_requests"
down_revision: Union[str, None] = "023_account_invitations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("join_token", sa.String(length=64), nullable=True))
    op.add_column(
        "organizations",
        sa.Column("join_link_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_organizations_join_token", "organizations", ["join_token"], unique=True)

    op.create_table(
        "organization_join_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("job_title", sa.String(length=300), nullable=True),
        sa.Column("specialization", sa.Text(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("reject_reason", sa.Text(), nullable=True),
        sa.Column(
            "decided_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'withdrawn')",
            name="ck_organization_join_requests_status",
        ),
    )
    op.create_index(
        "ix_organization_join_requests_org_status",
        "organization_join_requests",
        ["organization_id", "status"],
    )
    op.create_index("ix_organization_join_requests_user", "organization_join_requests", ["user_id"])
    # At most one pending request per person and organization
    op.create_index(
        "uq_organization_join_requests_pending",
        "organization_join_requests",
        ["organization_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_organization_join_requests_pending", table_name="organization_join_requests")
    op.drop_index("ix_organization_join_requests_user", table_name="organization_join_requests")
    op.drop_index("ix_organization_join_requests_org_status", table_name="organization_join_requests")
    op.drop_table("organization_join_requests")
    op.drop_index("ix_organizations_join_token", table_name="organizations")
    op.drop_column("organizations", "join_link_enabled")
    op.drop_column("organizations", "join_token")
