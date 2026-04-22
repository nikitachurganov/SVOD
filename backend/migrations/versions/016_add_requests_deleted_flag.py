"""add requests.deleted flag

Revision ID: 016_add_requests_deleted
Revises: 015_add_forms_archived
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "016_add_requests_deleted"
down_revision: Union[str, None] = "015_add_forms_archived"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "requests",
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.alter_column("requests", "deleted", server_default=None)


def downgrade() -> None:
    op.drop_column("requests", "deleted")
