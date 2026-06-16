"""public request metadata: applicant_description, public_link_token, link usage_count

Revision ID: 018_public_request_metadata
Revises: 017_request_workflow
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "018_public_request_metadata"
down_revision: Union[str, None] = "017_request_workflow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "requests",
        sa.Column("applicant_description", sa.Text(), nullable=True),
    )
    op.add_column(
        "requests",
        sa.Column("public_link_token", sa.String(length=128), nullable=True),
    )
    op.create_index("ix_requests_public_link_token", "requests", ["public_link_token"])

    op.add_column(
        "public_request_links",
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("public_request_links", "usage_count")
    op.drop_index("ix_requests_public_link_token", table_name="requests")
    op.drop_column("requests", "public_link_token")
    op.drop_column("requests", "applicant_description")
