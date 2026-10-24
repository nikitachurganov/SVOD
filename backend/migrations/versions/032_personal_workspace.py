"""personal workspace: an organization flagged is_personal, at most one per user

Revision ID: 032_personal_workspace
Revises: 031_password_reset_tokens
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "032_personal_workspace"
down_revision: Union[str, None] = "031_password_reset_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("is_personal", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "uq_organizations_personal_owner",
        "organizations",
        ["owner_user_id"],
        unique=True,
        postgresql_where=sa.text("is_personal"),
    )


def downgrade() -> None:
    op.drop_index("uq_organizations_personal_owner", table_name="organizations")
    op.drop_column("organizations", "is_personal")
