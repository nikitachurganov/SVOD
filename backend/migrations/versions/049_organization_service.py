"""organizations.service: which of the two services a team belongs to

The same account works in the requests platform and in the standalone surveys service, but their
teams must not mix: a team lives in the service it was created in and is invisible in the other one.

Existing rows: a personal workspace is the surveys service's; a team that holds surveys and no
requests is the surveys service's; everything else stays in the requests platform.

Revision ID: 049_organization_service
Revises: 048_token_grants
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "049_organization_service"
down_revision: Union[str, None] = "048_token_grants"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("service", sa.String(16), nullable=False, server_default="platform"),
    )
    op.create_check_constraint(
        "ck_organizations_service", "organizations", "service IN ('platform', 'surveys')"
    )
    op.execute("UPDATE organizations SET service = 'surveys' WHERE is_personal")
    op.execute(
        """
        UPDATE organizations o SET service = 'surveys'
        WHERE o.service = 'platform'
          AND EXISTS (SELECT 1 FROM surveys s WHERE s.organization_id = o.id)
          AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.organization_id = o.id)
        """
    )
    op.create_index("ix_organizations_service", "organizations", ["service"])


def downgrade() -> None:
    op.drop_index("ix_organizations_service", table_name="organizations")
    op.drop_constraint("ck_organizations_service", "organizations", type_="check")
    op.drop_column("organizations", "service")
