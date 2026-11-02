from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.api.routes import landing_demo as landing_routes
from app.schemas.landing_demo import LandingDemoRequest
from app.schemas.survey import SurveyAiBuildResponse
from app.services import landing_demo_service, public_suggest_rate_limit


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

    async def _call(self, builder, ip="10.0.0.1"):
        with patch.object(landing_demo_service.survey_ai_builder_service, "build_survey", builder):
            return await landing_routes.generate_landing_demo(
                LandingDemoRequest(prompt="оценка вовлеченности сотрудников"), _request(ip)
            )

    async def test_the_draft_follows_the_generated_survey(self):
        builder = AsyncMock(return_value=_built(_PAGES))

        result = await self._call(builder)

        self.assertEqual(result.title, "Вовлечённость сотрудников")
        self.assertEqual(result.total_questions, 6)
        self.assertEqual(result.questions[0].text, "Ваша роль в команде?")
        sent = builder.await_args.args[0]
        self.assertEqual(sent.messages[0].content, "оценка вовлеченности сотрудников")

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
