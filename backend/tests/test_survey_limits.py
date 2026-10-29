from __future__ import annotations

import asyncio
import dataclasses
import json
import unittest
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.models.survey import SurveyProject
from app.schemas.survey import SurveyAiChatMessage
from app.services import (
    ai_meter,
    billing_guard,
    billing_service,
    survey_ai_analysis_service,
    survey_service,
)
from tests.limited_plans import LIMITED_RESEARCHER as RESEARCHER
from tests.limited_plans import LIMITED_START as START

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)


def ent(plan=START):
    return billing_service.Entitlements(
        plan=plan,
        status="active",
        billing_interval="none",
        period_start=NOW - timedelta(days=10),
        period_end=NOW + timedelta(days=20),
        trial_ends_at=None,
        trial_used=False,
        cancel_at_period_end=False,
        billing_enabled=True,
        ai_window_start=NOW - timedelta(days=10),
        ai_window_end=NOW + timedelta(days=20),
    )


def pages(questions: int):
    fields = [{"id": f"q{i}", "type": "shortText", "label": f"Вопрос {i}"} for i in range(questions)]
    return [{"title": "Страница 1", "fields": fields}]


class LimitsCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = MagicMock()
        self.session.commit = AsyncMock()
        self.user = SimpleNamespace(id=uuid.uuid4())
        self.ent = ent()
        patch.object(
            billing_guard.billing_service,
            "get_entitlements",
            AsyncMock(side_effect=lambda *args, **kwargs: self.ent),
        ).start()
        patch.object(billing_guard.settings, "BILLING_ENFORCE", True).start()

        repo = survey_service.survey_repository
        self.open_count = patch.object(repo, "count_open_surveys_for_owner", AsyncMock(return_value=0)).start()
        self.project_count = patch.object(repo, "count_projects_for_owner", AsyncMock(return_value=0)).start()
        self.list_responses = patch.object(repo, "list_responses", AsyncMock(return_value=[])).start()
        self.count_responses = patch.object(repo, "count_responses", AsyncMock(return_value=0)).start()
        self.repo_update = patch.object(
            repo, "update", AsyncMock(side_effect=lambda session, survey: survey)
        ).start()
        patch.object(repo, "response_counts", AsyncMock(return_value={})).start()
        patch.object(survey_service, "_to_detail", MagicMock(return_value="detail")).start()

        self.survey = SimpleNamespace(
            id=uuid.uuid4(),
            name="Опрос",
            pages=pages(5),
            status="draft",
            organization_id=uuid.uuid4(),
            ai_summary=None,
        )
        patch.object(survey_service, "_get_for_member", AsyncMock(return_value=self.survey)).start()
        self.addCleanup(patch.stopall)

    def shadow(self):
        patch.object(billing_guard.settings, "BILLING_ENFORCE", False).start()


class ProjectLimitTests(LimitsCase):
    def setUp(self):
        super().setUp()
        patch.object(survey_service, "_ensure_member", AsyncMock()).start()
        self.create = patch.object(
            survey_service.survey_repository, "create_project", AsyncMock(return_value=SimpleNamespace())
        ).start()
        patch.object(survey_service, "_to_project_item", MagicMock(return_value="item")).start()
        self.payload = SimpleNamespace(
            organization_id=str(uuid.uuid4()), name="Курсовая", description=None, color=None
        )

    async def test_the_first_own_project_is_created(self):
        result = await survey_service.create_project(self.session, self.user, self.payload)

        self.assertEqual(result, "item")
        self.create.assert_awaited_once()
        self.session.commit.assert_awaited_once()

    async def test_the_second_one_is_refused_and_nothing_is_created(self):
        self.project_count.return_value = 1

        with self.assertRaises(HTTPException) as ctx:
            await survey_service.create_project(self.session, self.user, self.payload)

        self.assertEqual(ctx.exception.detail["limit"], "projects")
        self.create.assert_not_awaited()

    async def test_a_first_survey_still_gets_its_default_project_on_the_free_plan(self):
        self.project_count.return_value = 1
        default = SurveyProject(id=uuid.uuid4(), organization_id=uuid.uuid4(), name="Мои опросы")
        patch.object(survey_service, "_resolve_project_for_new_survey", AsyncMock(return_value=default)).start()
        patch.object(
            survey_service.survey_repository, "create", AsyncMock(side_effect=lambda session, s: s)
        ).start()
        payload = SimpleNamespace(
            organization_id=str(default.organization_id),
            project_id=None,
            name="Опрос",
            description=None,
            pages=pages(5),
            methodology_meta=None,
            anonymous=True,
        )

        self.assertEqual(await survey_service.create_survey(self.session, self.user, payload), "detail")


class CreateSurveyLimitTests(LimitsCase):
    def setUp(self):
        super().setUp()
        patch.object(survey_service, "_ensure_member", AsyncMock()).start()
        self.resolve = patch.object(survey_service, "_resolve_project_for_new_survey", AsyncMock()).start()

    async def test_a_survey_longer_than_the_plan_is_refused_before_anything_is_created(self):
        payload = SimpleNamespace(
            organization_id=str(uuid.uuid4()), project_id=None, name="Опрос", description=None,
            pages=pages(21), methodology_meta=None, anonymous=True,
        )

        with self.assertRaises(HTTPException) as ctx:
            await survey_service.create_survey(self.session, self.user, payload)

        self.assertEqual(ctx.exception.detail["limit"], "questions")
        self.resolve.assert_not_awaited()


class UpdateSurveyLimitTests(LimitsCase):
    def setUp(self):
        super().setUp()
        patch.object(survey_service.survey_repository, "count_responses", AsyncMock(return_value=0)).start()

    def payload(self, questions):
        return SimpleNamespace(
            name="Опрос", description=None, pages=pages(questions), methodology_meta=None,
            anonymous=True, closes_at=None,
        )

    async def test_growing_over_the_limit_is_refused_and_the_survey_is_unchanged(self):
        self.survey.pages = pages(18)

        with self.assertRaises(HTTPException) as ctx:
            await survey_service.update_survey(self.session, self.user, str(self.survey.id), self.payload(25))

        self.assertEqual(ctx.exception.detail["limit"], "questions")
        self.assertEqual(len(self.survey.pages[0]["fields"]), 18)
        self.repo_update.assert_not_awaited()

    async def test_a_survey_already_over_the_limit_can_still_be_edited(self):
        self.survey.pages = pages(30)

        result = await survey_service.update_survey(
            self.session, self.user, str(self.survey.id), self.payload(30)
        )

        self.assertEqual(result, "detail")

    async def test_shadow_mode_saves_it_anyway(self):
        self.shadow()
        self.survey.pages = pages(18)

        await survey_service.update_survey(self.session, self.user, str(self.survey.id), self.payload(25))

        self.repo_update.assert_awaited_once()


class PublishLimitTests(LimitsCase):
    async def publish(self, status="open"):
        return await survey_service.set_status(self.session, self.user, str(self.survey.id), status)

    async def test_publishing_below_the_limit_works(self):
        self.open_count.return_value = 2

        self.assertEqual(await self.publish(), "detail")
        self.assertEqual(self.survey.status, "open")

    async def test_publishing_at_the_limit_is_refused_and_the_status_is_unchanged(self):
        self.open_count.return_value = 3

        with self.assertRaises(HTTPException) as ctx:
            await self.publish()

        self.assertEqual(ctx.exception.detail["limit"], "active_surveys")
        self.assertEqual(self.survey.status, "draft")

    async def test_a_survey_that_is_already_open_does_not_count_against_itself(self):
        self.survey.status = "open"
        self.open_count.return_value = 3

        await self.publish()

        self.open_count.assert_not_awaited()

    async def test_closing_and_archiving_are_never_limited(self):
        self.open_count.return_value = 99
        self.survey.status = "open"

        await self.publish("closed")
        await self.publish("archived")

        self.open_count.assert_not_awaited()

    async def test_a_survey_longer_than_the_plan_cannot_be_published(self):
        self.survey.pages = pages(30)

        with self.assertRaises(HTTPException) as ctx:
            await self.publish()

        self.assertEqual(ctx.exception.detail["limit"], "questions")

    async def test_a_survey_without_questions_keeps_its_own_error_first(self):
        self.survey.pages = pages(0)
        self.open_count.return_value = 3

        with self.assertRaises(HTTPException) as ctx:
            await self.publish()

        self.assertEqual(ctx.exception.detail, "survey_has_no_questions")


class AnalysisLimitTests(LimitsCase):
    async def test_results_are_built_from_the_plans_newest_responses(self):
        flagged = SimpleNamespace(quality_flags={"too_fast": True}, id=1)
        self.list_responses.return_value = [flagged]
        build = patch.object(
            survey_service.survey_results, "build_results", MagicMock(return_value="results")
        ).start()

        result = await survey_service.get_results(self.session, self.user, str(self.survey.id))

        self.assertEqual(result, "results")
        self.assertEqual(self.list_responses.await_args.kwargs["limit"], 100)
        # The free plan keeps bad responses in the analysis; only the paid plan takes them out
        self.assertFalse(build.call_args.kwargs["exclude_flagged"])

    async def test_the_paid_plan_takes_bad_responses_out(self):
        self.ent = ent(RESEARCHER)
        self.list_responses.return_value = [SimpleNamespace(quality_flags={"too_fast": True}, id=1)]
        build = patch.object(
            survey_service.survey_results, "build_results", MagicMock(return_value="results")
        ).start()

        await survey_service.get_results(self.session, self.user, str(self.survey.id))

        self.assertEqual(self.list_responses.await_args.kwargs["limit"], 3_000)
        self.assertTrue(build.call_args.kwargs["exclude_flagged"])

    async def test_answers_keep_the_arrival_numbers_when_the_list_is_cut(self):
        self.ent = ent(dataclasses.replace(START, max_analyzed_responses=2))
        self.survey.pages = [{"title": "p", "fields": [{"id": "f1", "type": "longText", "label": "Почему"}]}]
        self.list_responses.return_value = [
            SimpleNamespace(id=uuid.uuid4(), quality_flags=None, answers={"f1": "Потому что"}, submitted_at=NOW),
            SimpleNamespace(id=uuid.uuid4(), quality_flags=None, answers={"f1": "Просто так"}, submitted_at=NOW),
        ]
        self.count_responses.return_value = 7

        page = await survey_service.get_question_answers(
            self.session, self.user, str(self.survey.id), "f1", limit=10, offset=0
        )

        # Two newest of seven responses: numbers 7 and 6, not 2 and 1
        self.assertEqual([item.number for item in page.items], [7, 6])


class FeatureLimitTests(LimitsCase):
    async def test_the_free_plan_has_no_crosstab_and_reads_nothing(self):
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.get_crosstab(self.session, self.user, str(self.survey.id), "a", "b")

        self.assertEqual(ctx.exception.detail["feature"], "crosstabs")
        self.list_responses.assert_not_awaited()

    async def test_the_paid_plan_gets_its_crosstab(self):
        self.ent = ent(RESEARCHER)
        rows = [SimpleNamespace(quality_flags=None, id=1)]
        self.list_responses.return_value = rows
        build = patch.object(
            survey_service.survey_results, "build_crosstab", MagicMock(return_value="crosstab")
        ).start()

        result = await survey_service.get_crosstab(self.session, self.user, str(self.survey.id), "a", "b")

        self.assertEqual(result, "crosstab")
        self.assertIs(build.call_args.args[1], rows)

    async def test_csv_export_is_a_paid_feature(self):
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.export_responses_csv(self.session, self.user, str(self.survey.id))
        self.assertEqual(ctx.exception.detail["feature"], "csv_export")
        self.list_responses.assert_not_awaited()

        self.ent = ent(RESEARCHER)
        patch.object(survey_service.survey_answers, "build_csv", MagicMock(return_value="a;b")).start()
        self.assertEqual(
            await survey_service.export_responses_csv(self.session, self.user, str(self.survey.id)),
            ("Опрос", "a;b"),
        )

    async def test_the_ai_chat_is_told_whether_it_may_build_a_crosstab(self):
        @asynccontextmanager
        async def meter(user, name, *, survey_id=None):
            yield

        patch.object(ai_meter, "action", meter).start()
        chat = patch.object(
            survey_service.survey_ai_analysis_service, "chat", AsyncMock(return_value="answer")
        ).start()
        payload = SimpleNamespace(messages=[SimpleNamespace(role="user")], exclude_flagged=True)

        await survey_service.ai_chat(self.session, self.user, str(self.survey.id), payload)
        self.assertFalse(chat.await_args.kwargs["allow_crosstab"])

        self.ent = ent(RESEARCHER)
        await survey_service.ai_chat(self.session, self.user, str(self.survey.id), payload)
        self.assertTrue(chat.await_args.kwargs["allow_crosstab"])


PAGES = [
    {
        "id": "p1",
        "fields": [
            {
                "id": "course",
                "type": "radio",
                "label": "Курс",
                "options": [{"id": "c1", "label": "1 курс"}, {"id": "c3", "label": "3 курс"}],
            },
            {"id": "score", "type": "number", "label": "Оценка сервиса"},
        ],
    }
]


def response(answers):
    return SimpleNamespace(
        answers=answers, quality_flags=None, duration_seconds=60, submitted_at=datetime.now(timezone.utc)
    )


class ChatCrosstabTests(unittest.TestCase):
    def run_chat(self, allow_crosstab):
        plan = json.dumps({"crosstab": {"row": "score", "col": "course"}})
        answer = json.dumps({"reply": "Оценки разные", "quote_ids": []})
        llm = AsyncMock(side_effect=[plan, answer])
        responses = [response({"course": "c1", "score": 5}), response({"course": "c3", "score": 2})]
        with patch.object(survey_ai_analysis_service, "_call_llm", llm):
            result = asyncio.run(
                survey_ai_analysis_service.chat(
                    "Опрос",
                    PAGES,
                    responses,
                    [SurveyAiChatMessage(role="user", content="Как оценки по курсам?")],
                    allow_crosstab=allow_crosstab,
                )
            )
        return result, llm

    def test_by_default_the_model_may_ask_for_a_crosstab(self):
        result, llm = self.run_chat(True)

        self.assertIsNotNone(result.crosstab)
        self.assertIn('"crosstab"', llm.await_args_list[1].args[0][1]["content"])

    def test_without_the_feature_the_crosstab_is_neither_built_nor_shown_to_the_model(self):
        result, llm = self.run_chat(False)

        self.assertIsNone(result.crosstab)
        self.assertNotIn('"crosstab"', llm.await_args_list[1].args[0][1]["content"])
        self.assertEqual(result.reply, "Оценки разные")


if __name__ == "__main__":
    unittest.main()
