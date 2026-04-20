"""forms.usage_count, forms.is_universal; requests.applicant_company.

Revision ID: 014_public_form_meta
Revises: 013_request_execution_stages
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "014_public_form_meta"
down_revision: Union[str, None] = "013_request_execution_stages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "forms",
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "forms",
        sa.Column("is_universal", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "requests",
        sa.Column("applicant_company", sa.String(length=500), nullable=True),
    )
    op.alter_column("forms", "usage_count", server_default=None)
    op.alter_column("forms", "is_universal", server_default=None)


def downgrade() -> None:
    op.drop_column("requests", "applicant_company")
    op.drop_column("forms", "is_universal")
    op.drop_column("forms", "usage_count")
