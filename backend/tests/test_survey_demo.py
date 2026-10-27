from __future__ import annotations

import random
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.schemas.survey_demo import DemoResponsesRequest
from app.services import survey_answers, survey_demo_service

NOW = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)


def options(*labels, other=None):
    items = [{"id": f"o{i}", "label": label} for i, label in enumerate(labels)]
    if other:
        items.append({"id": "other", "label": other, "isOther": True})
    return items


def field(id_, type_, **extra):
    data = {"id": id_, "type": type_, "label": id_, "required": False}
    data.update(extra)
    return data


def pages():
    return [
        {
            "id": "p1",
            "title": "Страница",
            "fields": [
                field("greet", "textBlock"),
                field("src", "radio", required=True, options=options("Поиск", "Друзья", other="Другое")),
                field("use", "yesNo", required=True),
                field(
                    "score",
                    "rating",
                    required=True,
                    config={"min": 1, "max": 5, "step": 1},
                ),
                field("nps", "rating", config={"min": 0, "max": 10, "step": 1}),
                field("feat", "checkbox", options=options("A", "B", "C", "D")),
                field("why", "longText"),
                field("short", "shortText"),
                field("age", "number", config={"min": 18, "max": 60}),
                field("mail", "email"),
                field(
                    "attn",
                    "radio",
                    options=options("Да", "Нет"),
                    config={"attentionCheck": True, "attentionCorrect": "Нет"},
                ),
                field("file", "file_image"),
            ],
        }
    ]


def survey_ns(form=None, **overrides):
    data = dict(
        id=uuid.uuid4(),
        pages=form if form is not None else pages(),
        created_at=NOW - timedelta(days=30),
        status="open",
        ai_summary={"bullets": ["x"]},
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


class GenerateAnswersTests(unittest.TestCase):
    def setUp(self):
        self.rng = random.Random(7)
        self.survey = survey_ns()
        self.responses = survey_demo_service.build_responses(self.survey, 40, self.rng, NOW)

    def test_every_response_passes_the_real_validation(self):
        self.assertEqual(len(self.responses), 40)
        for response in self.responses:
            cleaned = survey_answers.validate_answers(self.survey.pages, response.answers)
            self.assertEqual(cleaned, response.answers)

    def test_required_questions_are_always_answered(self):
        for response in self.responses:
            self.assertTrue({"src", "use", "score"} <= set(response.answers))

    def test_values_have_the_shape_the_web_form_stores(self):
        for response in self.responses:
            a = response.answers
            self.assertIn(a["use"], {"yes", "no"})
            self.assertTrue(1 <= a["score"]["value"] <= 5)
            self.assertEqual((a["score"]["min"], a["score"]["max"]), (1, 5))
            if "nps" in a:
                self.assertTrue(0 <= a["nps"]["value"] <= 10)
            if "feat" in a:
                self.assertIsInstance(a["feat"], list)
                self.assertTrue(1 <= len(a["feat"]) <= 3)
                self.assertEqual(len(set(a["feat"])), len(a["feat"]))
                self.assertTrue(set(a["feat"]) <= {"o0", "o1", "o2", "o3"})
            if "age" in a:
                self.assertTrue(18 <= a["age"] <= 60)
            if "mail" in a:
                self.assertTrue(a["mail"].endswith("@example.com"))
            self.assertIsInstance(a.get("why", ""), str)

    def test_single_choice_is_an_option_id_or_an_other_text(self):
        seen = {r.answers["src"] for r in self.responses}
        for value in seen:
            self.assertTrue(value in {"o0", "o1"} or value.startswith(survey_demo_service.OTHER_PREFIX), value)
        # With 40 respondents the distribution is not a single value
        self.assertGreater(len(seen), 1)

    def test_attention_check_gets_the_correct_answer(self):
        for response in self.responses:
            if "attn" in response.answers:
                self.assertEqual(response.answers["attn"], "o1")
            self.assertFalse((response.quality_flags or {}).get("failed_attention_check"))

    def test_non_generated_and_non_answer_types_are_left_out(self):
        for response in self.responses:
            self.assertNotIn("file", response.answers)
            self.assertNotIn("greet", response.answers)

    def test_responses_are_marked_and_not_too_fast(self):
        for response in self.responses:
            self.assertEqual(response.respondent_meta, {"demo": True})
            self.assertFalse((response.quality_flags or {}).get("too_fast"))
            self.assertGreater(response.duration_seconds, 0)

    def test_submission_times_fall_in_the_recent_window(self):
        for response in self.responses:
            age = NOW - response.submitted_at
            self.assertGreaterEqual(age, timedelta(0))
            self.assertLessEqual(age, timedelta(days=survey_demo_service.SPREAD_DAYS, seconds=1))

    def test_a_fresh_survey_is_not_filled_before_it_was_created(self):
        fresh = survey_ns(created_at=NOW - timedelta(hours=2))
        for response in survey_demo_service.build_responses(fresh, 10, random.Random(1), NOW):
            self.assertGreaterEqual(response.submitted_at, fresh.created_at)

    def test_every_requested_response_is_made_even_when_all_questions_are_optional(self):
        form = [
            {
                "id": "p",
                "title": "p",
                "fields": [field("a", "radio", options=options("X", "Y")), field("b", "yesNo")],
            }
        ]
        for seed in range(30):
            responses = survey_demo_service.build_responses(survey_ns(form), 25, random.Random(seed), NOW)
            self.assertEqual(len(responses), 25, seed)
            self.assertTrue(all(r.answers for r in responses))

    def test_same_seed_gives_the_same_answers(self):
        first = survey_demo_service.build_responses(self.survey, 5, random.Random(99), NOW)
        second = survey_demo_service.build_responses(self.survey, 5, random.Random(99), NOW)
        self.assertEqual([r.answers for r in first], [r.answers for r in second])

    def test_required_question_of_an_unsupported_type_is_refused(self):
        form = [{"id": "p", "title": "p", "fields": [field("addr", "address", required=True)]}]
        with self.assertRaises(HTTPException) as ctx:
            survey_demo_service.build_responses(survey_ns(form), 5, random.Random(1), NOW)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_rating_respects_a_custom_step(self):
        form = [
            {
                "id": "p",
                "title": "p",
                "fields": [field("r", "rating", required=True, config={"min": 0, "max": 10, "step": 2})],
            }
        ]
        values = {
            r.answers["r"]["value"]
            for r in survey_demo_service.build_responses(survey_ns(form), 50, random.Random(3), NOW)
        }
        self.assertTrue(values <= {0, 2, 4, 6, 8, 10}, values)


class AddDemoResponsesTests(unittest.IsolatedAsyncioTestCase):
    async def _add(self, survey, existing=0, count=25):
        session = session_mock()
        repo = survey_demo_service.survey_repository
        with (
            patch.object(survey_demo_service, "_get_for_member", AsyncMock(return_value=survey)),
            patch.object(repo, "count_responses", AsyncMock(return_value=existing)),
            patch.object(repo, "add_response", AsyncMock(side_effect=lambda s, r: r)) as add,
        ):
            result = await survey_demo_service.add_demo_responses(session, SimpleNamespace(), "id", count)
        return result, add, session

    async def test_published_empty_survey_gets_the_responses(self):
        result, add, session = await self._add(survey_ns(status="open"), count=25)
        self.assertEqual(result.created, 25)
        self.assertEqual(add.await_count, 25)
        session.commit.assert_awaited_once()

    async def test_draft_and_archived_surveys_are_refused(self):
        for state in ("draft", "archived"):
            with self.subTest(state):
                with self.assertRaises(HTTPException) as ctx:
                    await self._add(survey_ns(status=state))
                self.assertEqual(ctx.exception.status_code, 409)
                self.assertEqual(ctx.exception.detail, "survey_not_published")

    async def test_survey_with_answers_is_never_touched(self):
        with self.assertRaises(HTTPException) as ctx:
            await self._add(survey_ns(), existing=3)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, "survey_has_responses")

    def test_count_is_limited(self):
        for count in (0, 4, 51):
            with self.subTest(count):
                with self.assertRaises(ValueError):
                    DemoResponsesRequest(count=count)
        self.assertEqual(DemoResponsesRequest().count, 25)


class RemoveDemoResponsesTests(unittest.IsolatedAsyncioTestCase):
    async def _remove(self, survey, removed):
        session = session_mock()
        with (
            patch.object(survey_demo_service, "_get_for_member", AsyncMock(return_value=survey)),
            patch.object(
                survey_demo_service.survey_repository, "delete_demo_responses", AsyncMock(return_value=removed)
            ),
        ):
            result = await survey_demo_service.remove_demo_responses(session, SimpleNamespace(), "id")
        return result, session

    async def test_removing_drops_the_summary_made_from_test_answers(self):
        survey = survey_ns()
        result, session = await self._remove(survey, 25)
        self.assertEqual(result.removed, 25)
        self.assertIsNone(survey.ai_summary)
        session.commit.assert_awaited_once()

    async def test_nothing_to_remove_keeps_the_summary(self):
        survey = survey_ns()
        result, _ = await self._remove(survey, 0)
        self.assertEqual(result.removed, 0)
        self.assertIsNotNone(survey.ai_summary)


if __name__ == "__main__":
    unittest.main()
