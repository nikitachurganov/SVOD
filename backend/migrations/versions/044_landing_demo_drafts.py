"""landing demo drafts: surveys the AI built for anonymous visitors of svodservice.ru

A row lives until the visitor takes it into the service (a survey in their account) or expires.
The id is the token of the link «continue in the service».

Revision ID: 044_landing_demo_drafts
Revises: 043_user_identities
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "044_landing_demo_drafts"
down_revision: Union[str, None] = "043_user_identities"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "landing_demo_drafts",
        sa.Column("id", sa.String(length=32), primary_key=True, nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("pages", postgresql.JSONB(), nullable=False),
        sa.Column("methodology_meta", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "survey_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("surveys.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "claimed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_landing_demo_drafts_created_at", "landing_demo_drafts", ["created_at"])


def downgrade() -> None:
    op.drop_table("landing_demo_drafts")
