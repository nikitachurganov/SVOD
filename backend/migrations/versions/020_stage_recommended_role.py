"""add recommended role to request stages

Revision ID: 020_stage_recommended_role
Revises: 019_request_workflow_v2
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "020_stage_recommended_role"
down_revision: Union[str, None] = "019_request_workflow_v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "request_stages",
        sa.Column("recommended_role", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("request_stages", "recommended_role")
