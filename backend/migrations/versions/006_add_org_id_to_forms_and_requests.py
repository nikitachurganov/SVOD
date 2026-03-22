"""Add organization_id to forms and requests.

Revision ID: 006_add_org_id
Revises: 005_organizations
Create Date: 2026-03-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006_add_org_id"
down_revision: Union[str, None] = "005_organizations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "forms",
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_forms_organization_id", "forms", ["organization_id"])

    op.add_column(
        "requests",
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_requests_organization_id", "requests", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_requests_organization_id", table_name="requests")
    op.drop_column("requests", "organization_id")

    op.drop_index("ix_forms_organization_id", table_name="forms")
    op.drop_column("forms", "organization_id")
