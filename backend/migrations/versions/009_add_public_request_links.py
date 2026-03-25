"""Add public_request_links table and source column on requests.

Revision ID: 009_public_links
Revises: 008_add_ai_summary
Create Date: 2026-03-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "009_public_links"
down_revision: Union[str, None] = "008_add_ai_summary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "public_request_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("token", sa.String(128), nullable=False, unique=True, index=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.add_column(
        "requests",
        sa.Column("source", sa.String(50), nullable=True),
    )
    op.add_column(
        "requests",
        sa.Column("applicant_name", sa.String(500), nullable=True),
    )
    op.add_column(
        "requests",
        sa.Column("applicant_email", sa.String(320), nullable=True),
    )
    op.add_column(
        "requests",
        sa.Column("applicant_phone", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("requests", "applicant_phone")
    op.drop_column("requests", "applicant_email")
    op.drop_column("requests", "applicant_name")
    op.drop_column("requests", "source")
    op.drop_table("public_request_links")
