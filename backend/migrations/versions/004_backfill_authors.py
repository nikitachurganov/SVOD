"""Backfill author for existing forms and requests.

Revision ID: 004_backfill_author_for_existing_forms_and_requests
Revises: 003_add_author_to_forms_and_requests
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op

revision: str = "004_backfill_authors"
down_revision: Union[str, None] = "003_add_author"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Backfill legacy rows where author is missing.
    # Uses the earliest active user as a safe fallback.
    op.execute(
        """
        WITH fallback_user AS (
          SELECT id
          FROM users
          WHERE is_active = true
          ORDER BY created_at ASC
          LIMIT 1
        )
        UPDATE forms f
        SET created_by_user_id = fu.id
        FROM fallback_user fu
        WHERE f.created_by_user_id IS NULL;
        """
    )

    op.execute(
        """
        WITH fallback_user AS (
          SELECT id
          FROM users
          WHERE is_active = true
          ORDER BY created_at ASC
          LIMIT 1
        )
        UPDATE requests r
        SET created_by_user_id = fu.id
        FROM fallback_user fu
        WHERE r.created_by_user_id IS NULL;
        """
    )


def downgrade() -> None:
    # No safe rollback for data backfill.
    pass
