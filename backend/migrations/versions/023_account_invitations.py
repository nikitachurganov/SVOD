"""invitations that create a new account: kind, member profile fields

Revision ID: 023_account_invitations
Revises: 022_stage_timeline_dossiers
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "023_account_invitations"
down_revision: Union[str, None] = "022_stage_timeline_dossiers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organization_invitations",
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="existing_user"),
    )
    op.create_check_constraint(
        "ck_organization_invitations_kind",
        "organization_invitations",
        "kind IN ('existing_user', 'new_account')",
    )
    op.add_column(
        "organization_invitations",
        sa.Column("job_title", sa.String(length=300), nullable=True),
    )
    op.add_column(
        "organization_invitations",
        sa.Column("specialization", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organization_invitations", "specialization")
    op.drop_column("organization_invitations", "job_title")
    op.drop_constraint("ck_organization_invitations_kind", "organization_invitations", type_="check")
    op.drop_column("organization_invitations", "kind")
