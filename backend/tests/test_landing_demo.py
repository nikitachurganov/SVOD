from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.api.routes import landing_demo as landing_routes
from app.models.landing_demo_draft import LandingDemoDraft
from app.schemas.landing_demo import LandingDemoRequest
from app.schemas.survey import SurveyAiBuildResponse
from app.services import landing_demo_service, public_suggest_rate_limit


def _session(draft=None):
    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.get = AsyncMock(return_value=draft)
    return session


def _request(ip="10.0.0.1"):
    return SimpleNamespace(headers={"x-real-ip": ip}, client=SimpleNamespace(host=ip))


def _built(pages):
    return SurveyAiBuildResponse(
        reply="Составил анкету.",
        title="Вовлечённость сотрудников",
        pages=pages,
        methodology_meta={"methodologies": ["nps"]},
    )


_PAGES = [
    {"title": "Приветствие", "fields": [{"type": "textBlock", "label": "Здравствуйте"}]},
    {
        "title": "Вопросы",
        "fields": [
            {
                "id": "role",
                "type": "radio",
                "label": "Ваша роль в команде?",
                "required": True,
                "options": [{"label": "Сотрудник"}, {"label": "Руководитель"}],
            },
            {
                "type": "group",
                "label": "Блок",
                "children": [
                    {
                        "type": "rating",
                        "label": "Мне интересна моя работа",
                        "config": {"min": 1, "max": 5, "leftLabel": "Не согласен", "rightLabel": "Согласен"},
                    },
                    {
                        "type": "rating",
                        "label": "Порекомендуете ли вы компанию?",
                        "config": {"ratingVariant": "nps", "min": 0, "max": 10},
                    },
                ],
            },
            {
                "type": "radio",
                "label": "Выберите «Скорее согласен»",
                "options": [{"label": "Скорее согласен"}],
                "config": {"attentionCheck": True},
            },
            {"type": "checkbox", "label": "Что мешает?", "options": [{"label": "Шум"}]},
            {"type": "longText", "label": "Что улучшить?", "required": False},
        ],
    },
]


class ToLandingQuestionsTests(unittest.TestCase):
    def test_fields_are_flattened_and_mapped_to_the_landing_kinds(self):
        questions = landing_demo_service.to_landing_questions(_PAGES)

        self.assertEqual(
            [(q.number, q.type) for q in questions],
            [
                (1, "single_choice"),
                (2, "likert_scale_5"),
                (3, "scale_0_10"),
                (4, "attention_check"),
                (5, "multiple_choice"),
                (6, "open_text"),
            ],
        )
        self.assertEqual(questions[0].options, ["Сотрудник", "Руководитель"])
        self.assertEqual(questions[1].scaleLabels.min, "1 — Не согласен")
        self.assertEqual(questions[2].typeLabel, "Шкала NPS 0–10")
        self.assertFalse(questions[5].required)


class GenerateLandingDemoTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        public_suggest_rate_limit._buckets.clear()
        self.addCleanup(public_suggest_rate_limit._buckets.clear)
        budget = patch.object(landing_routes.ai_meter, "check_service_budget", AsyncMock())
        self.budget = budget.start()
        self.addCleanup(budget.stop)

    async def _call(self, builder, ip="10.0.0.1", session=None):
        with patch.object(landing_demo_service.survey_ai_builder_service, "build_survey", builder):
            return await landing_routes.generate_landing_demo(
                LandingDemoRequest(prompt="оценка вовлеченности сотрудников"),
                _request(ip),
                session or _session(),
            )

    async def test_the_draft_follows_the_generated_survey(self):
        builder = AsyncMock(return_value=_built(_PAGES))
        session = _session()

        result = await self._call(builder, session=session)

        self.assertEqual(result.title, "Вовлечённость сотрудников")
        self.assertEqual(result.total_questions, 6)
        self.assertEqual(result.questions[0].text, "Ваша роль в команде?")
        sent = builder.await_args.args[0]
        self.assertEqual(sent.messages[0].content, "оценка вовлеченности сотрудников")
        # The whole survey is kept under the token the landing links to
        saved = session.add.call_args.args[0]
        self.assertEqual(saved.id, result.draft_id)
        self.assertEqual(saved.pages, _PAGES)
        self.assertEqual(saved.methodology_meta, {"methodologies": ["nps"]})
        session.commit.assert_awaited()

    async def test_an_empty_survey_is_an_error_so_the_landing_falls_back(self):
        with self.assertRaises(HTTPException) as ctx:
            await self._call(AsyncMock(return_value=_built(None)))

        self.assertEqual(ctx.exception.status_code, 502)

    async def test_one_ip_is_limited_per_hour(self):
        builder = AsyncMock(return_value=_built(_PAGES))
        with patch.object(landing_routes.settings, "LANDING_DEMO_PER_IP_PER_HOUR", 2):
            await self._call(builder)
            await self._call(builder)
            with self.assertRaises(HTTPException) as ctx:
                await self._call(builder)
            await self._call(builder, ip="10.0.0.2")

        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(builder.await_count, 3)

    async def test_the_whole_demo_is_limited_per_day(self):
        builder = AsyncMock(return_value=_built(_PAGES))
        with patch.object(landing_routes.settings, "LANDING_DEMO_PER_DAY", 1):
            await self._call(builder, ip="10.0.0.1")
            with self.assertRaises(HTTPException) as ctx:
                await self._call(builder, ip="10.0.0.2")

        self.assertEqual(ctx.exception.status_code, 503)

    async def test_the_service_budget_stops_the_builder(self):
        self.budget.side_effect = HTTPException(status_code=503, detail={"code": "ai_budget_exceeded"})
        builder = AsyncMock()

        with self.assertRaises(HTTPException):
            await self._call(builder)

        builder.assert_not_awaited()


def _draft(**overrides):
    values = dict(
        id="tok",
        prompt="оценка вовлеченности",
        title="Вовлечённость",
        pages=_PAGES,
        methodology_meta={"methodologies": ["nps"]},
        created_at=datetime.now(timezone.utc),
        survey_id=None,
        claimed_by_user_id=None,
    )
    values.update(overrides)
    return LandingDemoDraft(**values)


class CreateSurveyFromDraftTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user = SimpleNamespace(id=uuid.uuid4())
        self.survey_id = str(uuid.uuid4())
        service = landing_demo_service.survey_service
        create = patch.object(service, "create_survey", AsyncMock(return_value=SimpleNamespace(id=self.survey_id)))
        get = patch.object(service, "get_survey", AsyncMock(return_value=SimpleNamespace(id="existing")))
        self.create, self.get = create.start(), get.start()
        self.addCleanup(create.stop)
        self.addCleanup(get.stop)

    async def _take(self, draft):
        return await landing_demo_service.create_survey_from_draft(_session(draft), self.user, "tok", "org-1")

    async def test_a_new_draft_becomes_a_survey_of_the_person(self):
        draft = _draft()

        survey = await self._take(draft)

        self.assertEqual(survey.id, self.survey_id)
        payload = self.create.await_args.args[2]
        self.assertEqual(payload.organization_id, "org-1")
        self.assertEqual(payload.name, "Вовлечённость")
        self.assertEqual(payload.pages, _PAGES)
        self.assertEqual(draft.survey_id, uuid.UUID(self.survey_id))
        self.assertEqual(draft.claimed_by_user_id, self.user.id)

    async def test_opening_the_link_again_leads_to_the_same_survey(self):
        survey_id = uuid.uuid4()
        draft = _draft(survey_id=survey_id, claimed_by_user_id=self.user.id)

        survey = await self._take(draft)

        self.assertEqual(survey.id, "existing")
        self.assertEqual(self.get.await_args.args[2], str(survey_id))
        self.create.assert_not_awaited()

    async def test_a_draft_taken_by_another_account_is_gone(self):
        draft = _draft(survey_id=uuid.uuid4(), claimed_by_user_id=uuid.uuid4())

        with self.assertRaises(HTTPException) as ctx:
            await self._take(draft)

        self.assertEqual(ctx.exception.status_code, 410)
        self.create.assert_not_awaited()

    async def test_missing_and_expired_drafts_are_not_found(self):
        expired = _draft(created_at=datetime.now(timezone.utc) - timedelta(days=30))
        for draft in (None, expired):
            with self.assertRaises(HTTPException) as ctx:
                await self._take(draft)
            self.assertEqual(ctx.exception.status_code, 404)
        self.create.assert_not_awaited()
