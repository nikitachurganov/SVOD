"""ai_usage_log: the team an AI action worked for and the Токены+ charged for it

* organization_id: the team of the survey (empty for actions outside a team, and for old rows);
  SET NULL, so the cost statistics outlive a deleted team;
* charged_tokens: what was taken from the counter after the weight of the model, next to the real
  prompt and completion tokens (empty for old rows and for actions that were not charged).

Revision ID: 046_ai_usage_pool
Revises: 045_team_roles_and_seats
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "046_ai_usage_pool"
down_revision: Union[str, None] = "045_team_roles_and_seats"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_usage_log",
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("ai_usage_log", sa.Column("charged_tokens", sa.Integer(), nullable=True))
    op.create_index(
        "ix_ai_usage_log_organization_id_created_at",
        "ai_usage_log",
        ["organization_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_usage_log_organization_id_created_at", table_name="ai_usage_log")
    op.drop_column("ai_usage_log", "charged_tokens")
    op.drop_column("ai_usage_log", "organization_id")
