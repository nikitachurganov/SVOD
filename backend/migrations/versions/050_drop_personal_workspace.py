"""drop the personal workspace: every workspace is a team that may have any number of people

Revision ID: 050_drop_personal_workspace
Revises: 049_organization_service
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "050_drop_personal_workspace"
down_revision: Union[str, None] = "049_organization_service"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The former personal workspaces become ordinary teams under a name that fits one
    op.execute(
        "UPDATE organizations SET name = 'Моя команда' "
        "WHERE is_personal AND name = 'Личное пространство'"
    )
    op.drop_index("uq_organizations_personal_owner", table_name="organizations")
    op.drop_column("organizations", "is_personal")


def downgrade() -> None:
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
