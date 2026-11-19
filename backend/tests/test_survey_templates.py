"""Deterministic questionnaires and the real manual creation authorization path."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch, sentinel
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.deps import get_current_user
from app.api.routes.surveys import router as surveys_router, templates_router
from app.core.database import get_async_session
from app.knowledge.survey_template_library import LIBRARY
from app.knowledge.survey_templates import Subject, TEMPLATES
from app.models.survey import SurveyProject
from app.schemas.survey_template import CreateSurveyFromTemplateRequest
from app.services import survey_methodology_service, survey_service, survey_template_service


def strip_ids(value):
    if isinstance(value, dict):
        return {key: strip_ids(item) for key, item in value.items() if key != "id"}
    if isinstance(value, list):
        return [strip_ids(item) for item in value]
    return value


def ids(value):
    if isinstance(value, dict):
        if "id" in value:
            yield value["id"]
        for item in value.values():
            yield from ids(item)
    elif isinstance(value, list):
        for item in value:
            yield from ids(item)


class CatalogTests(unittest.TestCase):
    def test_exact_catalog_and_counts(self):
        items = survey_template_service.list_templates()
        self.assertEqual([item.id for item in items], [
            "usability", "insights", "cta", "nps", "csat", "ces", "sus", "ueq",
            "needs", "purchase", "brand", "event", "employee", "course", "price",
        ])
        self.assertEqual(len(items), 15)
        self.assertEqual([item.questions_count for item in items], [5, 4, 4, 2, 2, 2, 10, 26, 5, 5, 4, 6, 6, 5, 4])

    def test_library_templates_are_plain_drafts_with_valid_fields(self):
        allowed = {"radio", "checkbox", "rating", "longText"}
        for key in LIBRARY:
            with self.subTest(template=key):
                detail = survey_template_service.get_template(key)
                self.assertEqual(detail.methodology_meta["methodologies"], [])
                self.assertIsNone(survey_methodology_service.build_summary(detail.methodology_meta, detail.pages))
                fields = detail.pages[0]["fields"]
                self.assertTrue(fields)
                for field in fields:
                    self.assertIn(field["type"], allowed)
                    self.assertTrue(field["label"].strip())
                    if field["type"] in {"radio", "checkbox"}:
                        labels = [option["label"] for option in field["options"]]
                        self.assertGreaterEqual(len(labels), 2)
                        self.assertEqual(len(labels), len(set(labels)))
        self.assertEqual(set(LIBRARY) | set(TEMPLATES), set(survey_template_service.CATALOG) | {"attention_check"})

    def test_templates_preserve_every_field_option_scale_and_metadata(self):
        for key in survey_template_service.CATALOG:
            if key not in TEMPLATES:
                continue
            with self.subTest(template=key):
                detail = survey_template_service.get_template(key)
                self.assertEqual(strip_ids(detail.pages[0]["fields"]), TEMPLATES[key](Subject()))
                self.assertEqual(survey_methodology_service.method_ids_from_meta(detail.methodology_meta), [key])
                summary = survey_methodology_service.build_summary(detail.methodology_meta, detail.pages)
                self.assertEqual(summary.methodologies[0].questions_count, detail.questions_count)

    def test_instances_have_disjoint_ids_and_no_shared_mutable_state(self):
        for key in survey_template_service.CATALOG:
            first = survey_template_service.get_template(key)
            second = survey_template_service.get_template(key)
            self.assertTrue(set(ids(first.pages)).isdisjoint(ids(second.pages)))
            first.pages[0]["fields"].clear()
            self.assertTrue(second.pages[0]["fields"])

    def test_unknown_template_is_404(self):
        with self.assertRaises(HTTPException) as result:
            survey_template_service.get_template("unknown")
        self.assertEqual(result.exception.status_code, 404)

    def test_blank_name_is_invalid(self):
        with self.assertRaises(ValidationError):
            CreateSurveyFromTemplateRequest(template_id="nps", organization_id=str(uuid4()), name="  ")

    def test_catalog_requires_authentication_but_not_edit_rights(self):
        app = FastAPI()
        app.include_router(templates_router, prefix="/survey-templates")
        app.dependency_overrides[get_async_session] = lambda: MagicMock()
        with TestClient(app) as client:
            self.assertEqual(client.get("/survey-templates").status_code, 401)
            app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4())
            self.assertEqual(client.get("/survey-templates").status_code, 200)
            self.assertEqual(client.get("/survey-templates/sus").json()["questions_count"], 10)
            self.assertEqual(client.get("/survey-templates/unknown").status_code, 404)

    def test_creation_route_is_registered_and_requires_authentication(self):
        app = FastAPI()
        app.include_router(surveys_router, prefix="/surveys")
        app.dependency_overrides[get_async_session] = lambda: MagicMock()
        payload = {"template_id": "nps", "organization_id": str(uuid4()), "name": "Опрос"}
        with TestClient(app) as client:
            self.assertEqual(client.post("/surveys/from-template", json=payload).status_code, 401)
            app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4())
            with patch.object(survey_template_service, "create_from_template", new=AsyncMock(side_effect=HTTPException(409, "template_handler"))) as create:
                response = client.post("/surveys/from-template", json=payload)
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json()["detail"], "template_handler")
                create.assert_awaited_once()


class CreationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.org_id = uuid4()
        self.project = SurveyProject(id=uuid4(), organization_id=self.org_id, name="Проект")
        self.user = SimpleNamespace(id=uuid4())
        self.session = MagicMock()
        self.session.commit = AsyncMock()
        self.payload = CreateSurveyFromTemplateRequest(template_id="nps", organization_id=str(self.org_id), name=" Новый опрос ", project_id=str(self.project.id))

    async def test_every_template_creates_draft_without_ai(self):
        with patch.object(survey_service.organization_repository, "get_member", new=AsyncMock(return_value=SimpleNamespace(role_tag="editor"))), \
             patch.object(survey_service.billing_guard, "ensure_questions_within_limit", new=AsyncMock()) as limit, \
             patch.object(survey_service.survey_repository, "get_project", new=AsyncMock(return_value=self.project)), \
             patch.object(survey_service.survey_repository, "create", new=AsyncMock(side_effect=lambda _, survey: survey)) as create, \
             patch.object(survey_service, "_to_detail", return_value=sentinel.detail), \
             patch("app.services.openrouter_client.post_chat_completion", new=AsyncMock()) as ai:
            for key in survey_template_service.CATALOG:
                payload = self.payload.model_copy(update={"template_id": key})
                self.assertIs(await survey_template_service.create_from_template(self.session, self.user, payload), sentinel.detail)
                survey = create.call_args.args[1]
                self.assertEqual(survey.status, "draft")
                self.assertEqual(survey.name, "Новый опрос")
                self.assertEqual(survey.created_by_user_id, self.user.id)
                self.assertEqual(survey.organization_id, self.org_id)
                self.assertEqual(survey.project, self.project)
                expected = [key] if key in survey_template_service.METHODOLOGIES else []
                self.assertEqual(survey_methodology_service.method_ids_from_meta(survey.methodology_meta), expected)
                limit.assert_awaited_with(self.session, self.user, survey.pages)
            ai.assert_not_awaited()

    async def test_reader_and_nonmember_are_rejected_before_writing(self):
        for member in (None, SimpleNamespace(role_tag="reader")):
            with patch.object(survey_service.organization_repository, "get_member", new=AsyncMock(return_value=member)), \
                 patch.object(survey_service.survey_repository, "create", new=AsyncMock()) as create:
                with self.assertRaises(HTTPException) as result:
                    await survey_template_service.create_from_template(self.session, self.user, self.payload)
                self.assertEqual(result.exception.status_code, 403)
                create.assert_not_awaited()

    async def test_foreign_project_is_rejected(self):
        other = SurveyProject(id=uuid4(), organization_id=uuid4(), name="Чужой")
        with patch.object(survey_service.organization_repository, "get_member", new=AsyncMock(return_value=SimpleNamespace(role_tag="editor"))), \
             patch.object(survey_service.billing_guard, "ensure_questions_within_limit", new=AsyncMock()), \
             patch.object(survey_service.survey_repository, "get_project", new=AsyncMock(return_value=other)), \
             patch.object(survey_service.survey_repository, "create", new=AsyncMock()) as create:
            with self.assertRaises(HTTPException) as result:
                await survey_template_service.create_from_template(self.session, self.user, self.payload)
            self.assertEqual(result.exception.status_code, 404)
            create.assert_not_awaited()

    async def test_existing_question_limit_is_enforced(self):
        with patch.object(survey_service.organization_repository, "get_member", new=AsyncMock(return_value=SimpleNamespace(role_tag="editor"))), \
             patch.object(survey_service.billing_guard, "ensure_questions_within_limit", new=AsyncMock(side_effect=HTTPException(403, "limit_reached"))), \
             patch.object(survey_service.survey_repository, "create", new=AsyncMock()) as create:
            with self.assertRaises(HTTPException):
                await survey_template_service.create_from_template(self.session, self.user, self.payload)
            create.assert_not_awaited()

    async def test_default_project_uses_existing_resolution(self):
        payload = self.payload.model_copy(update={"project_id": None})
        with patch.object(survey_service, "create_survey", new=AsyncMock(return_value=sentinel.detail)) as create:
            await survey_template_service.create_from_template(self.session, self.user, payload)
            self.assertIsNone(create.call_args.args[2].project_id)


if __name__ == "__main__":
    unittest.main()
