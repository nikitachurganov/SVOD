from __future__ import annotations

import json
import unittest
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.api.routes import surveys as surveys_routes
from app.constants.billing_plans import BASIC_METHODOLOGIES
from app.knowledge.methodologies import METHODOLOGIES
from app.schemas.survey import SurveyAiBuildRequest, SurveyAiBuildResponse
from app.services import billing_guard, billing_service
from app.services import survey_ai_builder_service as builder
from tests.limited_plans import LIMITED_RESEARCHER as RESEARCHER
from tests.limited_plans import LIMITED_START as START

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)


def request(text="Анкета для курсовой по лояльности студентов", **kwargs):
    return SurveyAiBuildRequest(messages=[{"role": "user", "content": text}], **kwargs)


def selection(category="academic_survey", methodologies=("likert", "nps")):
    return json.dumps(
        {
            "category": category,
            "goals": ["Оценить лояльность студентов"],
            "methodologies": list(methodologies),
            "subject": "вуза",
        },
        ensure_ascii=False,
    )


def generation():
    pages = [
        {
            "title": "Основное",
            "fields": [
                {
                    "type": "radio",
                    "label": "Расписание мне удобно",
                    "required": True,
                    "options": ["Не согласен", "Согласен"],
                    "methodology": "likert",
                }
            ],
        }
    ]
    return json.dumps({"reply": "Готово", "title": "Лояльность", "pages": pages}, ensure_ascii=False)


def ids_in(prompt: str) -> set[str]:
    return {mid for mid in METHODOLOGIES if f"- {mid} [" in prompt}


class SelectionPromptTests(unittest.TestCase):
    def test_the_default_prompt_offers_the_whole_catalogue(self):
        self.assertEqual(ids_in(builder._SELECT_PROMPT), set(METHODOLOGIES))
        self.assertEqual(builder._SELECT_PROMPT, builder._select_prompt())
        self.assertIn("(методики likert, semantic_differential, cognitive_interviewing, attention_check)", builder._SELECT_PROMPT)

    def test_the_free_plan_prompt_offers_only_the_basic_set(self):
        prompt = builder._select_prompt(BASIC_METHODOLOGIES)

        self.assertEqual(ids_in(prompt), set(BASIC_METHODOLOGIES))
        for locked in ("semantic_differential", "mom_test", "conjoint", "sus"):
            self.assertNotIn(locked, prompt)

    def test_directions_without_an_available_methodology_are_not_offered(self):
        prompt = builder._select_prompt(BASIC_METHODOLOGIES)

        self.assertIn("- academic_survey:", prompt)
        self.assertIn("- cx_metrics:", prompt)
        for category in ("custdev", "market_research", "ux_research"):
            self.assertNotIn(f"- {category}:", prompt)

    def test_the_hint_for_coursework_lists_only_available_methodologies(self):
        prompt = builder._select_prompt(BASIC_METHODOLOGIES)

        self.assertIn("(методики likert, cognitive_interviewing, attention_check)", prompt)


class ValidIdsTests(unittest.TestCase):
    def test_without_a_restriction_the_catalogue_decides(self):
        self.assertEqual(builder._valid_method_ids(["likert", "mom_test", "ghost"]), ["likert", "mom_test"])

    def test_with_the_basic_set_the_rest_is_dropped(self):
        ids = builder._valid_method_ids(["mom_test", "likert", "jtbd", "nps"], BASIC_METHODOLOGIES)

        self.assertEqual(ids, ["likert", "nps"])


class SelectMethodologiesTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_model_sees_the_restricted_catalogue_and_its_choice_is_filtered(self):
        llm = AsyncMock(return_value=selection("custdev", ("mom_test", "likert", "nps")))

        with patch.object(builder, "post_chat_completion", llm):
            result = await builder.select_methodologies("Проверить идею", BASIC_METHODOLOGIES)

        prompt = llm.await_args.args[0][0]["content"]
        self.assertEqual(ids_in(prompt), set(BASIC_METHODOLOGIES))
        self.assertEqual(result["methodologies"], ["likert", "nps"])

    async def test_without_a_restriction_the_default_prompt_is_used(self):
        llm = AsyncMock(return_value=selection("custdev", ("mom_test",)))

        with patch.object(builder, "post_chat_completion", llm):
            result = await builder.select_methodologies("Проверить идею")

        self.assertEqual(llm.await_args.args[0][0]["content"], builder._SELECT_PROMPT)
        self.assertEqual(result["methodologies"], ["mom_test"])


class BuildSurveyLimitTests(unittest.IsolatedAsyncioTestCase):
    async def build(self, payload, replies, **limits):
        llm = AsyncMock(side_effect=replies)
        with patch.object(builder, "post_chat_completion", llm):
            result = await builder.build_survey(payload, **limits)
        return result, llm

    async def test_methodologies_chosen_by_hand_are_cut_to_the_allowed_ones(self):
        payload = request(methodology_ids=["likert", "jtbd"])

        result, llm = await self.build(payload, [generation()], allowed_methodologies=BASIC_METHODOLOGIES)

        generation_prompt = llm.await_args.args[0][0]["content"]
        self.assertIn("Шкала Лайкерта", generation_prompt)
        self.assertNotIn("Jobs To Be Done", generation_prompt)
        # Likert makes it an academic survey, which always gets the attention check (a basic one)
        self.assertEqual(result.methodology_meta["methodologies"], ["likert", "attention_check"])

    async def test_an_academic_survey_still_gets_its_attention_check_on_the_free_plan(self):
        replies = [selection("academic_survey", ("likert",)), generation()]

        result, _ = await self.build(request(), replies, allowed_methodologies=BASIC_METHODOLOGIES)

        self.assertEqual(result.methodology_meta["methodologies"], ["likert", "attention_check"])

    async def test_the_attention_check_is_not_forced_when_the_plan_lacks_it(self):
        replies = [selection("academic_survey", ("likert",)), generation()]

        result, _ = await self.build(request(), replies, allowed_methodologies=frozenset({"likert"}))

        self.assertEqual(result.methodology_meta["methodologies"], ["likert"])

    async def test_without_limits_nothing_changes(self):
        replies = [selection("academic_survey", ("likert",)), generation()]

        result, llm = await self.build(request(), replies)

        self.assertEqual(result.methodology_meta["methodologies"], ["likert", "attention_check"])
        generation_prompt = llm.await_args.args[0][0]["content"]
        self.assertIn("обычно 8–20 вопросов, не больше 30", generation_prompt)

    async def test_the_model_is_told_how_many_questions_fit_the_plan(self):
        _, llm = await self.build(request(methodology_ids=["likert"]), [generation()], max_questions=15)

        self.assertIn("обычно 8–15 вопросов, не больше 15", llm.await_args.args[0][0]["content"])

    def test_a_big_plan_does_not_raise_the_builders_own_ceiling(self):
        prompt = builder._build_generation_prompt(["likert"], "вуза", max_questions=50)

        self.assertIn("обычно 8–20 вопросов, не больше 30", prompt)


def ent(plan=START, billing_enabled=True):
    return billing_service.Entitlements(
        plan=plan,
        status="active",
        billing_interval="none",
        period_start=NOW - timedelta(days=10),
        period_end=NOW + timedelta(days=20),
        trial_ends_at=None,
        trial_used=False,
        cancel_at_period_end=False,
        billing_enabled=billing_enabled,
        ai_window_start=NOW - timedelta(days=10),
        ai_window_end=NOW + timedelta(days=20),
    )


class RouteLimitTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user = SimpleNamespace(id=uuid.uuid4(), email_verified_at=NOW)
        self.ent = ent()
        self.metered = []

        @asynccontextmanager
        async def meter(user, name, *, survey_id=None):
            self.metered.append(name)
            yield

        patch.object(surveys_routes.ai_meter, "action", meter).start()
        patch.object(surveys_routes.email_service, "is_configured", return_value=False).start()
        patch.object(
            billing_guard, "entitlements", AsyncMock(side_effect=lambda *args, **kwargs: self.ent)
        ).start()
        patch.object(billing_guard.settings, "BILLING_ENFORCE", True).start()
        self.builder = patch.object(
            surveys_routes.survey_ai_builder_service,
            "build_survey",
            AsyncMock(return_value=SurveyAiBuildResponse(reply="Готово")),
        ).start()
        self.addCleanup(patch.stopall)

    async def call(self, **payload):
        return await surveys_routes.build_survey_with_ai(request(**payload), MagicMock(), self.user)

    async def test_a_locked_methodology_picked_by_hand_is_refused_before_any_ai_is_spent(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.call(methodology_ids=["likert", "mom_test"])

        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(ctx.exception.detail["feature"], "methodology")
        self.assertEqual(ctx.exception.detail["methodologies"], ["mom_test"])
        self.assertEqual(self.metered, [])
        self.builder.assert_not_awaited()

    async def test_the_free_plan_passes_its_limits_to_the_builder(self):
        await self.call(methodology_ids=["likert"])

        kwargs = self.builder.await_args.kwargs
        self.assertEqual(kwargs["allowed_methodologies"], BASIC_METHODOLOGIES)
        self.assertEqual(kwargs["max_questions"], 20)

    async def test_the_paid_plan_has_all_methodologies_and_a_longer_survey(self):
        self.ent = ent(RESEARCHER)

        await self.call(methodology_ids=["conjoint"])

        kwargs = self.builder.await_args.kwargs
        self.assertIsNone(kwargs["allowed_methodologies"])
        self.assertEqual(kwargs["max_questions"], 50)

    async def test_shadow_mode_and_billing_off_pass_no_limits(self):
        patch.object(billing_guard.settings, "BILLING_ENFORCE", False).start()
        await self.call(methodology_ids=["mom_test"])
        self.assertEqual(
            (self.builder.await_args.kwargs["allowed_methodologies"], self.builder.await_args.kwargs["max_questions"]),
            (None, None),
        )

        self.ent = ent(billing_enabled=False)
        await self.call(methodology_ids=["mom_test"])
        self.assertIsNone(self.builder.await_args.kwargs["max_questions"])


if __name__ == "__main__":
    unittest.main()
