"""survey projects: folders that group surveys

Every existing survey is moved into a default project of its organization, so nothing
disappears from the list and the public links keep working.

Revision ID: 030_survey_projects
Revises: 029_survey_ai_summary
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "030_survey_projects"
down_revision: Union[str, None] = "029_survey_ai_summary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_PROJECT_NAME = "Мои опросы"


def upgrade() -> None:
    op.create_table(
        "survey_projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_survey_projects_organization_id", "survey_projects", ["organization_id"])

    op.add_column(
        "surveys",
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("survey_projects.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )

    # One default project per organization that already has surveys (surveys of different
    # organizations are never mixed), then every survey is attached to it.
    op.execute(
        sa.text(
            """
            INSERT INTO survey_projects (id, organization_id, name, created_at, updated_at)
            SELECT gen_random_uuid(), org.organization_id, :name, now(), now()
            FROM (SELECT DISTINCT organization_id FROM surveys WHERE project_id IS NULL) AS org
            """
        ).bindparams(name=DEFAULT_PROJECT_NAME)
    )
    op.execute(
        """
        UPDATE surveys
        SET project_id = (
            SELECT p.id FROM survey_projects p
            WHERE p.organization_id = surveys.organization_id
            ORDER BY p.created_at, p.id
            LIMIT 1
        )
        WHERE project_id IS NULL
        """
    )

    op.alter_column("surveys", "project_id", nullable=False)
    op.create_index("ix_surveys_project_id", "surveys", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_surveys_project_id", table_name="surveys")
    op.drop_column("surveys", "project_id")
    op.drop_index("ix_survey_projects_organization_id", table_name="survey_projects")
    op.drop_table("survey_projects")
