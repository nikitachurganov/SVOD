"""Add author columns to forms and requests.

Revision ID: 003_add_author_to_forms_and_requests
Revises: 002_split_user_full_name
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003_add_author"
down_revision: Union[str, None] = "002_split_user_full_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "forms",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_forms_created_by_user_id", "forms", ["created_by_user_id"], unique=False
    )
    op.create_foreign_key(
        "fk_forms_created_by_user_id_users",
        "forms",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "requests",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_requests_created_by_user_id", "requests", ["created_by_user_id"], unique=False
    )
    op.create_foreign_key(
        "fk_requests_created_by_user_id_users",
        "requests",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_requests_created_by_user_id_users", "requests", type_="foreignkey"
    )
    op.drop_index("ix_requests_created_by_user_id", table_name="requests")
    op.drop_column("requests", "created_by_user_id")

    op.drop_constraint("fk_forms_created_by_user_id_users", "forms", type_="foreignkey")
    op.drop_index("ix_forms_created_by_user_id", table_name="forms")
    op.drop_column("forms", "created_by_user_id")
