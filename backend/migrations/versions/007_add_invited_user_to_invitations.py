"""Add invited_user_id to organization_invitations.

Revision ID: 007_add_invited_user
Revises: 006_add_org_id
Create Date: 2026-03-13

Adds a direct FK from organization_invitations to users so that
"invitations for me" queries use a join on user_id instead of email string.
Existing rows are left with invited_user_id = NULL and will not appear in
the "my invitations" list until re-invited via the new flow.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "007_add_invited_user"
down_revision: Union[str, None] = "006_add_org_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organization_invitations",
        sa.Column(
            "invited_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_org_invitations_invited_user_id",
        "organization_invitations",
        ["invited_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_org_invitations_invited_user_id",
        table_name="organization_invitations",
    )
    op.drop_column("organization_invitations", "invited_user_id")
