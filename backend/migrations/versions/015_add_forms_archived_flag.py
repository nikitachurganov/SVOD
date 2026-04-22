"""add forms.archived flag

Revision ID: 015_add_forms_archived
Revises: 014_public_form_meta
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "015_add_forms_archived"
down_revision: Union[str, None] = "014_public_form_meta"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "forms",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.alter_column("forms", "archived", server_default=None)


def downgrade() -> None:
    op.drop_column("forms", "archived")
