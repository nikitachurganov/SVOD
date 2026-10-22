from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.schemas.survey import CreateSurveyRequest, SubmitSurveyRequest
from app.services import survey_service

PAGES = [
    {
        "fields": [
            {"id": "q1", "type": "shortText", "label": "Тема", "required": True},
            {
                "id": "att",
                "type": "radio",
                "label": "Выберите «Согласен»",
                "required": True,
                "options": [{"id": "o1", "label": "Не согласен"}, {"id": "o2", "label": "Согласен"}],
                "config": {"attentionCheck": True, "attentionCorrect": "Согласен"},
            },
        ]
    }
]


def _survey(**overrides):
    data = dict(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        organization=SimpleNamespace(name="Вуз"),
        author=None,
        created_by_user_id=uuid.uuid4(),
        name="Опрос",
        description=None,
        pages=PAGES,
        methodology_meta=None,
        status="open",
        public_token="tok",
        anonymous=True,
        closes_at=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _session():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


class PublicSurveyTests(unittest.IsolatedAsyncioTestCase):
    async def _get(self, survey):
        with patch.object(survey_service.survey_repository, "get_by_token", AsyncMock(return_value=survey)):
            return await survey_service.get_public_survey(_session(), "tok")

    async def test_draft_and_missing_are_hidden(self):
        for survey in (None, _survey(status="draft"), _survey(status="archived")):
            with self.assertRaises(HTTPException) as ctx:
                await self._get(survey)
            self.assertEqual(ctx.exception.status_code, 404)

    async def test_closed_or_expired_is_gone(self):
        expired = _survey(closes_at=datetime.now(timezone.utc) - timedelta(minutes=1))
        for survey in (_survey(status="closed"), expired):
            with self.assertRaises(HTTPException) as ctx:
                await self._get(survey)
            self.assertEqual(ctx.exception.status_code, 410)

    async def test_public_payload_hides_correct_answer_and_org_when_anonymous(self):
        result = await self._get(_survey())
        self.assertIsNone(result.organization_name)
        self.assertNotIn("attentionCorrect", result.pages[0]["fields"][1]["config"])
        named = await self._get(_survey(anonymous=False))
        self.assertEqual(named.organization_name, "Вуз")


class SubmitTests(unittest.IsolatedAsyncioTestCase):
    async def _submit(self, survey, answers, duration=120):
        saved = {}

        async def add(session, response):
            saved["response"] = response
            response.id = uuid.uuid4()
            return response

        with patch.object(
            survey_service.survey_repository, "get_by_token", AsyncMock(return_value=survey)
        ), patch.object(survey_service.survey_repository, "add_response", add):
            await survey_service.submit_public_response(
                _session(), "tok", SubmitSurveyRequest(answers=answers, duration_seconds=duration)
            )
        return saved["response"]

    async def test_valid_submission_is_stored_with_flags(self):
        response = await self._submit(_survey(), {"q1": "ответ", "att": "o1", "junk": 1})
        self.assertEqual(response.answers, {"q1": "ответ", "att": "o1"})
        self.assertEqual(response.quality_flags, {"failed_attention_check": True})
        self.assertIsNone(response.respondent_meta)

    async def test_correct_attention_check_has_no_flags(self):
        response = await self._submit(_survey(), {"q1": "ответ", "att": "o2"})
        self.assertIsNone(response.quality_flags)

    async def test_required_missing_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            await self._submit(_survey(), {"att": "o2"})
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail["code"], "required_missing")
        self.assertEqual(ctx.exception.detail["missing"], ["Тема"])


class OwnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_cannot_open_empty_survey(self):
        survey = _survey(status="draft", pages=[])
        user = SimpleNamespace(id=uuid.uuid4())
        with patch.object(
            survey_service.survey_repository, "get_by_id", AsyncMock(return_value=survey)
        ), patch.object(
            survey_service.organization_repository, "get_member", AsyncMock(return_value=object())
        ):
            with self.assertRaises(HTTPException) as ctx:
                await survey_service.set_status(_session(), user, str(survey.id), "open")
        self.assertEqual(ctx.exception.detail, "survey_has_no_questions")

    async def test_non_member_is_forbidden(self):
        survey = _survey()
        user = SimpleNamespace(id=uuid.uuid4())
        with patch.object(
            survey_service.survey_repository, "get_by_id", AsyncMock(return_value=survey)
        ), patch.object(
            survey_service.organization_repository, "get_member", AsyncMock(return_value=None)
        ):
            with self.assertRaises(HTTPException) as ctx:
                await survey_service.get_survey(_session(), user, str(survey.id))
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_invalid_id_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.get_survey(_session(), SimpleNamespace(id=uuid.uuid4()), "not-a-uuid")
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
