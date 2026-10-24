from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.models.survey import SurveyProject
from app.schemas.survey import CreateProjectRequest, CreateSurveyRequest, UpdateProjectRequest
from app.services import survey_service

ORG = uuid.uuid4()
OTHER_ORG = uuid.uuid4()


def _user():
    return SimpleNamespace(id=uuid.uuid4())


def _project(**overrides):
    now = datetime.now(timezone.utc)
    data = dict(
        id=uuid.uuid4(),
        organization_id=ORG,
        created_by_user_id=None,
        name="Проект",
        description=None,
        color=None,
        created_at=now,
        updated_at=now,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _survey(project, **overrides):
    now = datetime.now(timezone.utc)
    data = dict(
        id=uuid.uuid4(),
        organization_id=project.organization_id,
        project_id=project.id,
        project=project,
        author=None,
        created_by_user_id=None,
        name="Опрос",
        description=None,
        pages=[],
        methodology_meta=None,
        status="draft",
        public_token="tok",
        anonymous=True,
        closes_at=None,
        created_at=now,
        updated_at=now,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _echo(survey):
    """What ``survey_repository.create`` leaves on a new survey after the flush/refresh."""
    now = datetime.now(timezone.utc)
    survey.id = uuid.uuid4()
    survey.project_id = survey.project.id
    survey.author = None
    survey.created_at = survey.updated_at = now
    return survey


def _session():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


class ProjectSchemaTests(unittest.TestCase):
    def test_name_is_trimmed_and_required(self):
        payload = CreateProjectRequest(organization_id=str(ORG), name="  Обучение  ")
        self.assertEqual(payload.name, "Обучение")
        for blank in ("", "   "):
            with self.assertRaises(ValidationError):
                UpdateProjectRequest(name=blank)

    def test_name_length_is_limited(self):
        with self.assertRaises(ValidationError):
            UpdateProjectRequest(name="я" * 201)

    def test_blank_description_becomes_none(self):
        self.assertIsNone(UpdateProjectRequest(name="A", description="   ").description)
        self.assertEqual(UpdateProjectRequest(name="A", description=" текст ").description, "текст")

    def test_color_must_be_in_the_palette(self):
        self.assertEqual(UpdateProjectRequest(name="A", color="violet").color, "violet")
        self.assertIsNone(UpdateProjectRequest(name="A", color="").color)
        self.assertIsNone(UpdateProjectRequest(name="A").color)
        with self.assertRaises(ValidationError):
            UpdateProjectRequest(name="A", color="#ff0000")


class _ServiceCase(unittest.IsolatedAsyncioTestCase):
    def patch_repo(self, **functions):
        patcher = patch.multiple(
            survey_service.survey_repository,
            **{name: AsyncMock(return_value=value) for name, value in functions.items()},
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def patch_member(self, is_member=True):
        patcher = patch.object(
            survey_service.organization_repository,
            "get_member",
            AsyncMock(return_value=object() if is_member else None),
        )
        patcher.start()
        self.addCleanup(patcher.stop)


class CreateSurveyProjectTests(_ServiceCase):
    async def _create(self, payload):
        # ``create`` echoes the survey it is given, as the real one does after a flush
        create = AsyncMock(side_effect=lambda session, survey: _echo(survey))
        with patch.object(survey_service.survey_repository, "create", create):
            return await survey_service.create_survey(_session(), _user(), payload), create

    async def test_explicit_project_is_used(self):
        project = _project()
        self.patch_member()
        self.patch_repo(get_project=project)
        detail, create = await self._create(
            CreateSurveyRequest(organization_id=str(ORG), project_id=str(project.id), name="Опрос")
        )
        self.assertEqual(detail.project_id, str(project.id))
        self.assertIs(create.call_args.args[1].project, project)

    async def test_foreign_organization_project_is_rejected(self):
        project = _project(organization_id=OTHER_ORG)
        self.patch_member()
        self.patch_repo(get_project=project)
        with self.assertRaises(HTTPException) as ctx:
            await self._create(
                CreateSurveyRequest(
                    organization_id=str(ORG), project_id=str(project.id), name="Опрос"
                )
            )
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_without_project_default_one_is_used(self):
        default = _project(name="Мои опросы")
        self.patch_member()
        self.patch_repo(get_default_project=default)
        detail, _ = await self._create(CreateSurveyRequest(organization_id=str(ORG), name="Опрос"))
        self.assertEqual(detail.project_id, str(default.id))

    async def test_without_any_project_default_is_created(self):
        self.patch_member()
        created: list[SurveyProject] = []

        async def create_project(session, project):
            project.id = uuid.uuid4()
            project.created_at = project.updated_at = datetime.now(timezone.utc)
            created.append(project)
            return project

        self.patch_repo(get_default_project=None)
        with patch.object(
            survey_service.survey_repository, "create_project", AsyncMock(side_effect=create_project)
        ):
            detail, _ = await self._create(
                CreateSurveyRequest(organization_id=str(ORG), name="Опрос")
            )
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0].name, survey_service.DEFAULT_PROJECT_NAME)
        self.assertEqual(created[0].organization_id, ORG)
        self.assertEqual(detail.project_id, str(created[0].id))

    async def test_non_member_cannot_create(self):
        self.patch_member(False)
        with self.assertRaises(HTTPException) as ctx:
            await self._create(CreateSurveyRequest(organization_id=str(ORG), name="Опрос"))
        self.assertEqual(ctx.exception.status_code, 403)


class MoveSurveyTests(_ServiceCase):
    async def test_move_changes_only_the_project(self):
        source, target = _project(), _project(name="Другой")
        survey = _survey(source)
        original = (survey.id, survey.public_token, survey.name, survey.status)
        self.patch_member()
        self.patch_repo(
            get_by_id=survey,
            get_project=target,
            update=survey,
            response_counts={survey.id: 7},
            last_response_dates={},
        )
        session = _session()
        detail = await survey_service.move_survey(session, _user(), str(survey.id), str(target.id))

        self.assertIs(survey.project, target)
        self.assertEqual((survey.id, survey.public_token, survey.name, survey.status), original)
        self.assertEqual(detail.responses_count, 7)
        session.commit.assert_awaited_once()

    async def test_move_to_same_project_is_a_noop(self):
        project = _project()
        survey = _survey(project)
        self.patch_member()
        self.patch_repo(
            get_by_id=survey,
            get_project=project,
            response_counts={},
            last_response_dates={},
        )
        session = _session()
        await survey_service.move_survey(session, _user(), str(survey.id), str(project.id))
        session.commit.assert_not_awaited()

    async def test_move_to_other_organization_project_is_rejected(self):
        source = _project()
        survey = _survey(source)
        foreign = _project(organization_id=OTHER_ORG)
        self.patch_member()
        self.patch_repo(get_by_id=survey, get_project=foreign)
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.move_survey(_session(), _user(), str(survey.id), str(foreign.id))
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIs(survey.project, source)

    async def test_non_member_cannot_move(self):
        survey = _survey(_project())
        self.patch_member(False)
        self.patch_repo(get_by_id=survey)
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.move_survey(_session(), _user(), str(survey.id), str(uuid.uuid4()))
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_bad_ids_are_not_found(self):
        self.patch_member()
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.move_survey(_session(), _user(), "nope", "nope")
        self.assertEqual(ctx.exception.status_code, 404)


class ProjectCrudTests(_ServiceCase):
    async def test_list_counts_surveys_per_project(self):
        a, b = _project(name="A"), _project(name="B")
        self.patch_member()
        self.patch_repo(list_projects=[a, b], survey_counts_by_project={a.id: 3})
        items = await survey_service.list_projects(_session(), _user(), ORG)
        self.assertEqual([(i.name, i.surveys_count) for i in items], [("A", 3), ("B", 0)])

    async def test_list_requires_membership(self):
        self.patch_member(False)
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.list_projects(_session(), _user(), ORG)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_get_unknown_project_is_not_found(self):
        self.patch_repo(get_project=None)
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.get_project(_session(), _user(), str(uuid.uuid4()))
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_rename_commits_and_returns_new_name(self):
        project = _project(name="Старое")
        self.patch_member()
        self.patch_repo(get_project=project, update_project=project, survey_counts_by_project={})
        session = _session()
        item = await survey_service.update_project(
            session, _user(), str(project.id), UpdateProjectRequest(name=" Новое ", description="О")
        )
        self.assertEqual((item.name, item.description), ("Новое", "О"))
        session.commit.assert_awaited_once()

    async def test_rename_by_non_member_is_forbidden(self):
        project = _project()
        self.patch_member(False)
        self.patch_repo(get_project=project)
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.update_project(
                _session(), _user(), str(project.id), UpdateProjectRequest(name="X")
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_project_with_surveys_cannot_be_deleted(self):
        project = _project()
        self.patch_member()
        delete = AsyncMock()
        self.patch_repo(get_project=project, count_all_in_project=2)
        session = _session()
        with patch.object(survey_service.survey_repository, "delete_project", delete):
            with self.assertRaises(HTTPException) as ctx:
                await survey_service.delete_project(session, _user(), str(project.id))
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, "project_not_empty")
        delete.assert_not_awaited()
        session.commit.assert_not_awaited()

    async def test_empty_project_is_deleted(self):
        project = _project()
        self.patch_member()
        delete = AsyncMock()
        self.patch_repo(get_project=project, count_all_in_project=0)
        session = _session()
        with patch.object(survey_service.survey_repository, "delete_project", delete):
            await survey_service.delete_project(session, _user(), str(project.id))
        delete.assert_awaited_once()
        session.commit.assert_awaited_once()


class ListFilterTests(_ServiceCase):
    async def test_list_is_limited_to_the_project(self):
        project = _project()
        survey = _survey(project)
        self.patch_member()
        self.patch_repo(get_project=project, response_counts={}, last_response_dates={})
        list_filtered = AsyncMock(return_value=[survey])
        with patch.object(survey_service.survey_repository, "list_filtered", list_filtered):
            items = await survey_service.list_surveys(
                _session(), _user(), ORG, project_id=str(project.id)
            )
        self.assertEqual(list_filtered.call_args.kwargs["project_id"], project.id)
        self.assertEqual([i.project_name for i in items], ["Проект"])

    async def test_unknown_project_filter_is_not_found(self):
        self.patch_member()
        self.patch_repo(get_project=None)
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.list_surveys(
                _session(), _user(), ORG, project_id=str(uuid.uuid4())
            )
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
