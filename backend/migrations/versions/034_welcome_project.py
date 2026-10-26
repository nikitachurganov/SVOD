"""welcome project: a sample survey for personal workspaces that have no projects yet

New workspaces get it when they are created (welcome_seed_service); this adds it once to the
existing ones. A workspace that already has any project is left alone, so nobody's list changes.

Revision ID: 034_welcome_project
Revises: 033_survey_project_color
"""

import secrets
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "034_welcome_project"
down_revision: Union[str, None] = "033_survey_project_color"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Imported here so that the migration only needs the app code at the moment it runs
    from app.services.welcome_seed_service import (
        WELCOME_PROJECT_NAME,
        WELCOME_SURVEY_NAME,
        welcome_survey_pages,
    )

    bind = op.get_bind()
    workspaces = bind.execute(
        sa.text(
            """
            SELECT o.id, o.owner_user_id
            FROM organizations o
            WHERE o.is_personal
              AND NOT EXISTS (SELECT 1 FROM survey_projects p WHERE p.organization_id = o.id)
            """
        )
    ).fetchall()

    insert_project = sa.text(
        """
        INSERT INTO survey_projects (id, organization_id, created_by_user_id, name, created_at, updated_at)
        VALUES (:id, :organization_id, :user_id, :name, now(), now())
        """
    )
    insert_survey = sa.text(
        """
        INSERT INTO surveys (
            id, organization_id, project_id, created_by_user_id, name, description,
            pages, status, public_token, anonymous, created_at, updated_at
        )
        VALUES (
            :id, :organization_id, :project_id, :user_id, :name, :description,
            :pages, 'draft', :token, true, now(), now()
        )
        """
    ).bindparams(sa.bindparam("pages", type_=postgresql.JSONB))

    for organization_id, user_id in workspaces:
        project_id = uuid.uuid4()
        bind.execute(
            insert_project,
            {
                "id": project_id,
                "organization_id": organization_id,
                "user_id": user_id,
                "name": WELCOME_PROJECT_NAME,
            },
        )
        bind.execute(
            insert_survey,
            {
                "id": uuid.uuid4(),
                "organization_id": organization_id,
                "project_id": project_id,
                "user_id": user_id,
                "name": WELCOME_SURVEY_NAME,
                "description": "Образец: посмотрите, как выглядит опрос, и попробуйте его изменить.",
                "pages": welcome_survey_pages(),
                "token": secrets.token_urlsafe(24),
            },
        )


def downgrade() -> None:
    # Only the untouched sample is removed: a survey the user changed or collected answers on stays
    op.execute(
        sa.text(
            """
            DELETE FROM surveys s
            USING survey_projects p
            WHERE s.project_id = p.id
              AND p.name = :project
              AND s.name = :survey
              AND s.status = 'draft'
              AND NOT EXISTS (SELECT 1 FROM survey_responses r WHERE r.survey_id = s.id)
            """
        ).bindparams(project="Добро пожаловать", survey="Пример опроса: знакомство с СВОД")
    )
    op.execute(
        sa.text(
            """
            DELETE FROM survey_projects p
            WHERE p.name = :project
              AND NOT EXISTS (SELECT 1 FROM surveys s WHERE s.project_id = p.id)
            """
        ).bindparams(project="Добро пожаловать")
    )
