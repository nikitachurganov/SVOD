"""mark legacy archived requests with the canonical workflow status

Revision ID: 021_archive_deleted_requests
Revises: 020_stage_recommended_role
"""

from typing import Sequence, Union

from alembic import op


revision: str = "021_archive_deleted_requests"
down_revision: Union[str, None] = "020_stage_recommended_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE requests SET workflow_status = 'archived' WHERE deleted = true")


def downgrade() -> None:
    # A legacy archive did not preserve its prior workflow state, so it cannot be restored safely.
    pass
