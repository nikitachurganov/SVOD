from __future__ import annotations

import dataclasses
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.constants.billing_plans import BASIC_METHODOLOGIES, RESEARCHER, START
from app.core import metrics
from app.services import billing_guard, billing_service

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
PERIOD_END = NOW + timedelta(days=20)


def ent(plan=START, billing_enabled=True):
    return billing_service.Entitlements(
        plan=plan,
        status="active",
        billing_interval="none",
        period_start=NOW - timedelta(days=10),
        period_end=PERIOD_END,
        trial_ends_at=None,
        trial_used=False,
        cancel_at_period_end=False,
        billing_enabled=billing_enabled,
    )


def pages(questions: int, text_blocks: int = 0):
    fields = [{"id": f"q{i}", "type": "shortText", "label": f"Вопрос {i}"} for i in range(questions)]
    fields += [{"id": f"t{i}", "type": "textBlock", "label": "Пояснение"} for i in range(text_blocks)]
    return [{"title": "Страница 1", "fields": fields}]


def hits(limit: str, plan: str = "start", enforced: str = "true") -> float:
    return metrics.BILLING_LIMIT_HIT.labels(limit, plan, enforced)._value.get()


class GuardCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = MagicMock()
        self.user = SimpleNamespace(id=uuid.uuid4())
        self.ent = ent()
        self.get_ent = patch.object(
            billing_guard.billing_service,
            "get_entitlements",
            AsyncMock(side_effect=lambda *args, **kwargs: self.ent),
        ).start()
        repo = billing_guard.survey_repository
        self.open_count = patch.object(repo, "count_open_surveys_for_owner", AsyncMock(return_value=0)).start()
        self.project_count = patch.object(repo, "count_projects_for_owner", AsyncMock(return_value=0)).start()
        self.list_responses = patch.object(repo, "list_responses", AsyncMock(return_value=[])).start()
        self.count_responses = patch.object(repo, "count_responses", AsyncMock(return_value=0)).start()
        patch.object(billing_guard.settings, "BILLING_ENFORCE", True).start()
        self.addCleanup(patch.stopall)

    def shadow(self):
        patch.object(billing_guard.settings, "BILLING_ENFORCE", False).start()

    def billing_off(self):
        self.ent = ent(billing_enabled=False)


class PublishedSurveysTests(GuardCase):
    async def test_below_the_limit_passes(self):
        self.open_count.return_value = 2

        await billing_guard.ensure_can_open_survey(self.session, self.user)

    async def test_at_the_limit_is_refused_with_the_numbers(self):
        self.open_count.return_value = 3
        before = hits("active_surveys")

        with self.assertRaises(HTTPException) as ctx:
            await billing_guard.ensure_can_open_survey(self.session, self.user)

        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(
            ctx.exception.detail,
            {
                "code": "limit_reached",
                "limit": "active_surveys",
                "used": 3,
                "max": 3,
                "plan": "start",
                "upgrade_to": "researcher",
                "resets_at": PERIOD_END.isoformat(),
            },
        )
        self.assertEqual(hits("active_surveys") - before, 1)

    async def test_the_paid_plan_allows_twenty(self):
        self.ent = ent(RESEARCHER)
        self.open_count.return_value = 19
        await billing_guard.ensure_can_open_survey(self.session, self.user)

        self.open_count.return_value = 20
        with self.assertRaises(HTTPException) as ctx:
            await billing_guard.ensure_can_open_survey(self.session, self.user)
        self.assertIsNone(ctx.exception.detail["upgrade_to"])

    async def test_an_admin_override_replaces_the_limit(self):
        self.ent = ent(dataclasses.replace(START, max_active_surveys=10))
        self.open_count.return_value = 9

        await billing_guard.ensure_can_open_survey(self.session, self.user)

    async def test_shadow_mode_lets_it_through_and_counts(self):
        self.shadow()
        self.open_count.return_value = 3
        before = hits("active_surveys", enforced="false")

        await billing_guard.ensure_can_open_survey(self.session, self.user)

        self.assertEqual(hits("active_surveys", enforced="false") - before, 1)

    async def test_billing_off_does_not_even_count(self):
        self.billing_off()

        await billing_guard.ensure_can_open_survey(self.session, self.user)

        self.open_count.assert_not_awaited()


class ProjectTests(GuardCase):
    async def test_the_free_plan_has_one_project(self):
        await billing_guard.ensure_can_add_project(self.session, self.user)

        self.project_count.return_value = 1
        with self.assertRaises(HTTPException) as ctx:
            await billing_guard.ensure_can_add_project(self.session, self.user)
        self.assertEqual(
            (ctx.exception.detail["limit"], ctx.exception.detail["used"], ctx.exception.detail["max"]),
            ("projects", 1, 1),
        )

    async def test_the_paid_plan_has_ten(self):
        self.ent = ent(RESEARCHER)
        self.project_count.return_value = 9
        await billing_guard.ensure_can_add_project(self.session, self.user)

        self.project_count.return_value = 10
        with self.assertRaises(HTTPException):
            await billing_guard.ensure_can_add_project(self.session, self.user)

    async def test_shadow_mode_and_billing_off_never_refuse(self):
        self.project_count.return_value = 5
        self.shadow()
        await billing_guard.ensure_can_add_project(self.session, self.user)

        self.billing_off()
        await billing_guard.ensure_can_add_project(self.session, self.user)


class QuestionTests(GuardCase):
    async def check(self, new, previous=None):
        await billing_guard.ensure_questions_within_limit(
            self.session, self.user, new, previous_pages=previous
        )

    async def test_twenty_questions_pass_and_twenty_one_do_not(self):
        await self.check(pages(20))

        with self.assertRaises(HTTPException) as ctx:
            await self.check(pages(21))
        self.assertEqual(
            (ctx.exception.detail["limit"], ctx.exception.detail["used"], ctx.exception.detail["max"]),
            ("questions", 21, 20),
        )

    async def test_text_blocks_are_not_questions(self):
        await self.check(pages(20, text_blocks=6))

    async def test_a_survey_over_the_limit_can_be_shortened_or_kept_but_not_lengthened(self):
        # The plan got smaller after the survey was written: 30 questions on a plan for 20
        await self.check(pages(25), previous=pages(30))
        await self.check(pages(30), previous=pages(30))

        with self.assertRaises(HTTPException):
            await self.check(pages(31), previous=pages(30))

    async def test_publishing_a_survey_over_the_limit_is_refused(self):
        with self.assertRaises(HTTPException):
            await self.check(pages(30))

    async def test_the_paid_plan_allows_fifty(self):
        self.ent = ent(RESEARCHER)
        await self.check(pages(50))

        with self.assertRaises(HTTPException):
            await self.check(pages(51))

    async def test_shadow_mode_counts_and_billing_off_ignores(self):
        self.shadow()
        before = hits("questions", enforced="false")
        await self.check(pages(40))
        self.assertEqual(hits("questions", enforced="false") - before, 1)

        self.billing_off()
        await self.check(pages(400))

    def test_the_builder_is_told_the_limit_only_when_it_is_enforced(self):
        self.assertEqual(billing_guard.question_cap(ent()), 20)
        self.assertEqual(billing_guard.question_cap(ent(RESEARCHER)), 50)
        self.shadow()
        self.assertIsNone(billing_guard.question_cap(ent()))
        self.assertIsNone(billing_guard.question_cap(ent(billing_enabled=False)))


class FeatureTests(GuardCase):
    async def test_the_free_plan_has_no_crosstabs_or_csv(self):
        for feature in ("crosstabs", "csv_export"):
            with self.subTest(feature=feature):
                with self.assertRaises(HTTPException) as ctx:
                    await billing_guard.ensure_feature(self.session, self.user, feature)
                self.assertEqual(ctx.exception.status_code, 402)
                self.assertEqual(
                    ctx.exception.detail,
                    {
                        "code": "limit_reached",
                        "limit": "feature",
                        "feature": feature,
                        "plan": "start",
                        "upgrade_to": "researcher",
                        "resets_at": PERIOD_END.isoformat(),
                    },
                )

    async def test_the_paid_plan_has_them(self):
        self.ent = ent(RESEARCHER)

        await billing_guard.ensure_feature(self.session, self.user, "crosstabs")
        await billing_guard.ensure_feature(self.session, self.user, "csv_export")

    async def test_shadow_mode_counts_which_feature_was_wanted(self):
        self.shadow()
        before = hits("feature_crosstabs", enforced="false")

        await billing_guard.ensure_feature(self.session, self.user, "crosstabs")

        self.assertEqual(hits("feature_crosstabs", enforced="false") - before, 1)

    async def test_billing_off_has_every_feature(self):
        self.billing_off()

        await billing_guard.ensure_feature(self.session, self.user, "crosstabs")


class MethodologyTests(GuardCase):
    def test_the_basic_set_is_the_student_set(self):
        self.assertEqual(
            BASIC_METHODOLOGIES,
            {"likert", "nps", "csat", "cognitive_interviewing", "attention_check"},
        )

    def test_only_the_enforced_free_plan_is_restricted(self):
        self.assertEqual(billing_guard.allowed_methodologies(ent()), BASIC_METHODOLOGIES)
        self.assertIsNone(billing_guard.allowed_methodologies(ent(RESEARCHER)))
        self.assertIsNone(billing_guard.allowed_methodologies(ent(billing_enabled=False)))
        self.shadow()
        self.assertIsNone(billing_guard.allowed_methodologies(ent()))

    def test_picking_methodologies_outside_the_set_by_hand_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            billing_guard.ensure_methodologies(ent(), ["likert", "mom_test", "jtbd", "mom_test"])

        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(ctx.exception.detail["limit"], "feature")
        self.assertEqual(ctx.exception.detail["feature"], "methodology")
        self.assertEqual(ctx.exception.detail["methodologies"], ["mom_test", "jtbd"])

    def test_the_basic_set_unknown_ids_and_nothing_pass(self):
        for requested in (None, [], ["likert", "nps"], ["not_in_the_catalogue"]):
            with self.subTest(requested=requested):
                billing_guard.ensure_methodologies(ent(), requested)

    def test_the_paid_plan_and_billing_off_may_pick_any(self):
        billing_guard.ensure_methodologies(ent(RESEARCHER), ["conjoint"])
        billing_guard.ensure_methodologies(ent(billing_enabled=False), ["conjoint"])

    def test_shadow_mode_counts_the_attempt(self):
        self.shadow()
        before = hits("feature_methodology", enforced="false")

        billing_guard.ensure_methodologies(ent(), ["conjoint"])

        self.assertEqual(hits("feature_methodology", enforced="false") - before, 1)


def rows(count, **attrs):
    return [SimpleNamespace(quality_flags=attrs.get("flags"), id=i) for i in range(count)]


class AnalysisTests(GuardCase):
    async def load(self, exclude_flagged=True, ceiling=10_000):
        return await billing_guard.load_analysis(
            self.session, self.user, uuid.uuid4(), ceiling=ceiling, exclude_flagged=exclude_flagged
        )

    async def test_billing_off_reads_up_to_the_ceiling_and_changes_nothing(self):
        self.billing_off()
        self.list_responses.return_value = rows(3, flags={"too_fast": True})

        analysis = await self.load()

        self.assertEqual(self.list_responses.await_args.kwargs["limit"], 10_000)
        self.assertTrue(analysis.exclude_flagged)
        self.assertTrue(analysis.crosstab_allowed)
        self.assertEqual((len(analysis.rows), analysis.total), (3, 3))
        self.count_responses.assert_not_awaited()

    async def test_the_free_plan_analyses_its_newest_hundred(self):
        await self.load()

        self.assertEqual(self.list_responses.await_args.kwargs["limit"], 100)

    async def test_the_paid_plan_analyses_three_thousand(self):
        self.ent = ent(RESEARCHER)

        analysis = await self.load()

        self.assertEqual(self.list_responses.await_args.kwargs["limit"], 3_000)
        self.assertTrue(analysis.crosstab_allowed)

    async def test_the_plan_limit_never_exceeds_the_technical_ceiling(self):
        self.ent = ent(RESEARCHER)

        await self.load(ceiling=500)

        self.assertEqual(self.list_responses.await_args.kwargs["limit"], 500)

    async def test_the_free_plan_has_no_crosstab_in_the_chat(self):
        self.assertFalse((await self.load()).crosstab_allowed)

    async def test_shadow_mode_reads_everything_but_counts_the_overflow(self):
        self.shadow()
        self.list_responses.return_value = rows(150)
        self.count_responses.return_value = 150
        before = hits("analysis_rows", enforced="false")

        analysis = await self.load(ceiling=150)

        self.assertEqual(self.list_responses.await_args.kwargs["limit"], 150)
        self.assertTrue(analysis.crosstab_allowed)
        self.assertEqual(hits("analysis_rows", enforced="false") - before, 1)

    async def test_the_real_total_is_counted_when_the_list_was_cut_off(self):
        self.list_responses.return_value = rows(100)
        self.count_responses.return_value = 140

        analysis = await self.load()

        self.assertEqual((len(analysis.rows), analysis.total), (100, 140))

    async def test_the_total_is_the_list_when_nothing_was_cut_off(self):
        self.list_responses.return_value = rows(7)

        analysis = await self.load()

        self.assertEqual(analysis.total, 7)
        self.count_responses.assert_not_awaited()

    async def test_the_free_plan_keeps_bad_responses_in_the_analysis(self):
        self.list_responses.return_value = [
            *rows(2),
            SimpleNamespace(quality_flags={"too_fast": True}, id=99),
        ]
        before = hits("feature_quality_filter")

        analysis = await self.load(exclude_flagged=True)

        self.assertFalse(analysis.exclude_flagged)
        self.assertEqual(hits("feature_quality_filter") - before, 1)

    async def test_without_bad_responses_there_is_nothing_to_count(self):
        self.list_responses.return_value = rows(3)
        before = hits("feature_quality_filter")

        analysis = await self.load(exclude_flagged=True)

        self.assertTrue(analysis.exclude_flagged)
        self.assertEqual(hits("feature_quality_filter") - before, 0)

    async def test_a_weak_signal_alone_never_excluded_anything(self):
        self.list_responses.return_value = rows(2, flags={"straight_lining": True})

        analysis = await self.load(exclude_flagged=True)

        self.assertTrue(analysis.exclude_flagged)

    async def test_the_paid_plan_takes_bad_responses_out(self):
        self.ent = ent(RESEARCHER)
        self.list_responses.return_value = rows(2, flags={"too_fast": True})

        self.assertTrue((await self.load(exclude_flagged=True)).exclude_flagged)

    async def test_asking_not_to_exclude_is_respected_on_every_plan(self):
        self.list_responses.return_value = rows(2, flags={"too_fast": True})

        self.assertFalse((await self.load(exclude_flagged=False)).exclude_flagged)

    async def test_shadow_mode_keeps_the_request_and_counts_it(self):
        self.shadow()
        self.list_responses.return_value = rows(2, flags={"too_fast": True})
        before = hits("feature_quality_filter", enforced="false")

        analysis = await self.load(exclude_flagged=True)

        self.assertTrue(analysis.exclude_flagged)
        self.assertEqual(hits("feature_quality_filter", enforced="false") - before, 1)


if __name__ == "__main__":
    unittest.main()
