"""survey projects: folder colour (a key of the client palette)

Revision ID: 033_survey_project_color
Revises: 032_personal_workspace
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "033_survey_project_color"
down_revision: Union[str, None] = "032_personal_workspace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("survey_projects", sa.Column("color", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("survey_projects", "color")
