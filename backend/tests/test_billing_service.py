from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.routes import billing as billing_routes
from app.constants.billing_plans import AI_LIFETIME_ANCHOR, PLAN_UNLIMITED, RESEARCHER, START
from app.services import billing_service as service

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
DAY = timedelta(days=1)
GRACE = 3


def sub(**overrides):
    data = dict(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        plan_code="researcher",
        status="active",
        billing_interval="month",
        current_period_start=NOW - 10 * DAY,
        current_period_end=NOW + 20 * DAY,
        trial_ends_at=None,
        trial_used_at=None,
        cancel_at_period_end=False,
        limit_overrides=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def session_mock():
    session = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    return session


class EffectivePlanTests(unittest.TestCase):
    def code(self, **overrides):
        return service.effective_plan_code(sub(**overrides), NOW, GRACE)

    def test_free_plan_is_always_free(self):
        for status in ("active", "expired", "past_due"):
            with self.subTest(status=status):
                self.assertEqual(self.code(plan_code="start", status=status), "start")

    def test_paid_plan_works_inside_the_paid_period(self):
        self.assertEqual(self.code(), "researcher")

    def test_paid_plan_stops_at_the_end_of_the_period(self):
        self.assertEqual(self.code(current_period_end=NOW), "start")
        self.assertEqual(self.code(current_period_end=NOW - DAY), "start")
        self.assertEqual(self.code(current_period_end=NOW + timedelta(seconds=1)), "researcher")

    def test_trial_works_until_it_ends(self):
        trial = dict(status="trialing", current_period_end=NOW - DAY)
        self.assertEqual(self.code(trial_ends_at=NOW + DAY, **trial), "researcher")
        self.assertEqual(self.code(trial_ends_at=NOW, **trial), "start")
        self.assertEqual(self.code(trial_ends_at=None, **trial), "start")

    def test_failed_renewal_keeps_the_plan_for_the_grace_period(self):
        late = dict(status="past_due")
        self.assertEqual(self.code(current_period_end=NOW - 2 * DAY, **late), "researcher")
        # The grace period of three days ends exactly here
        self.assertEqual(self.code(current_period_end=NOW - 3 * DAY, **late), "start")
        self.assertEqual(self.code(current_period_end=NOW - 5 * DAY, **late), "start")

    def test_expired_subscription_is_free(self):
        self.assertEqual(self.code(status="expired"), "start")

    def test_unknown_plan_code_is_free(self):
        self.assertEqual(self.code(plan_code="gold"), "start")


class ResolveEntitlementsTests(unittest.TestCase):
    def resolve(self, **overrides):
        return service.resolve_entitlements(sub(**overrides), NOW, GRACE)

    def test_paid_subscription_keeps_its_stored_period_and_status(self):
        ent = self.resolve()

        self.assertIs(ent.plan, RESEARCHER)
        self.assertEqual((ent.status, ent.billing_interval), ("active", "month"))
        self.assertEqual((ent.period_start, ent.period_end), (NOW - 10 * DAY, NOW + 20 * DAY))
        self.assertTrue(ent.billing_enabled)

    def test_free_window_moves_forward_every_thirty_days(self):
        free = dict(plan_code="start", billing_interval="none")
        cases = (
            (NOW - DAY, NOW - DAY),
            (NOW - 29 * DAY, NOW - 29 * DAY),
            (NOW - 30 * DAY, NOW),
            (NOW - 40 * DAY, NOW - 10 * DAY),
            (NOW - 95 * DAY, NOW - 5 * DAY),
        )
        for started, expected_start in cases:
            with self.subTest(started=started):
                ent = self.resolve(current_period_start=started, **free)
                self.assertEqual(ent.period_start, expected_start)
                self.assertEqual(ent.period_end, expected_start + 30 * DAY)

    def test_ran_out_paid_plan_reports_a_free_window_from_the_moment_access_ended(self):
        ent = self.resolve(current_period_end=NOW - 5 * DAY)

        self.assertIs(ent.plan, START)
        self.assertEqual((ent.status, ent.billing_interval), ("expired", "none"))
        self.assertEqual(ent.period_start, NOW - 5 * DAY)
        self.assertEqual(ent.period_end, NOW + 25 * DAY)

    def test_overrides_apply_to_a_paid_plan_and_to_a_free_row(self):
        paid = self.resolve(limit_overrides={"ai_tokens_per_period": 10_000_000})
        free = self.resolve(
            plan_code="start", billing_interval="none", limit_overrides={"ai_tokens_per_period": 40}
        )

        self.assertEqual(paid.plan.ai_tokens_per_period, 10_000_000)
        self.assertEqual(paid.plan.max_projects, RESEARCHER.max_projects)
        self.assertEqual(free.plan.ai_tokens_per_period, 40)

    def test_overrides_go_away_with_the_paid_plan(self):
        ent = self.resolve(
            current_period_end=NOW - 5 * DAY, limit_overrides={"ai_tokens_per_period": 10_000_000}
        )

        self.assertEqual(ent.plan.ai_tokens_per_period, START.ai_tokens_per_period)

    def test_the_free_allowance_is_counted_once_for_good(self):
        ent = self.resolve(plan_code="start", billing_interval="none")

        self.assertEqual((ent.ai_window_start, ent.ai_window_end), (AI_LIFETIME_ANCHOR, None))

    def test_a_ran_out_subscription_goes_back_to_the_free_allowance(self):
        ent = self.resolve(current_period_end=NOW - 5 * DAY)

        self.assertEqual((ent.ai_window_start, ent.ai_window_end), (AI_LIFETIME_ANCHOR, None))

    def test_a_monthly_subscription_gets_its_tokens_for_the_period(self):
        ent = self.resolve()

        self.assertEqual((ent.ai_window_start, ent.ai_window_end), (NOW - 10 * DAY, NOW + 20 * DAY))

    def test_a_yearly_subscription_gets_its_tokens_back_every_thirty_days(self):
        start = NOW - 70 * DAY
        ent = self.resolve(
            billing_interval="year", current_period_start=start, current_period_end=start + 365 * DAY
        )

        # The third 30-day window of the year: days 60..90
        self.assertEqual((ent.ai_window_start, ent.ai_window_end), (start + 60 * DAY, start + 90 * DAY))
        self.assertEqual((ent.period_start, ent.period_end), (start, start + 365 * DAY))

    def test_the_last_window_of_a_subscription_does_not_outlive_it(self):
        start = NOW - 35 * DAY
        ent = self.resolve(current_period_start=start, current_period_end=start + 45 * DAY)

        self.assertEqual((ent.ai_window_start, ent.ai_window_end), (start + 30 * DAY, start + 45 * DAY))

    def test_a_pack_is_counted_over_its_whole_term(self):
        ent = self.resolve(plan_code="pack", billing_interval="one_off")

        self.assertEqual(ent.plan.code, "pack")
        self.assertEqual((ent.ai_window_start, ent.ai_window_end), (NOW - 10 * DAY, NOW + 20 * DAY))

    def test_trial_flags(self):
        used = self.resolve(trial_used_at=NOW - 60 * DAY, cancel_at_period_end=True)
        fresh = self.resolve()

        self.assertTrue(used.trial_used)
        self.assertTrue(used.cancel_at_period_end)
        self.assertFalse(fresh.trial_used)


class EnsureSubscriptionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        repo = service.billing_repository
        self.get = patch.object(repo, "get_subscription", AsyncMock()).start()
        self.create = patch.object(repo, "create_subscription_if_missing", AsyncMock()).start()
        self.add_event = patch.object(repo, "add_event", AsyncMock()).start()
        self.addCleanup(patch.stopall)
        self.session = session_mock()
        self.user_id = uuid.uuid4()

    async def test_free_subscription_is_created_on_first_use(self):
        created = sub(plan_code="start", current_period_start=NOW, current_period_end=NOW + 30 * DAY)
        new_id = uuid.uuid4()
        self.get.side_effect = [None, created]
        self.create.return_value = new_id

        result = await service.ensure_subscription(self.session, self.user_id, NOW)

        self.assertIs(result, created)
        kwargs = self.create.await_args.kwargs
        self.assertEqual(
            (kwargs["plan_code"], kwargs["status"], kwargs["billing_interval"]),
            ("start", "active", "none"),
        )
        self.assertEqual((kwargs["period_start"], kwargs["period_end"]), (NOW, NOW + 30 * DAY))
        self.add_event.assert_awaited_once()
        event = self.add_event.await_args.kwargs
        self.assertEqual((event["subscription_id"], event["kind"]), (new_id, "created"))

    async def test_losing_the_race_to_a_parallel_request_writes_no_second_event(self):
        existing = sub(plan_code="start", current_period_start=NOW, current_period_end=NOW + 30 * DAY)
        self.get.side_effect = [None, existing]
        self.create.return_value = None

        result = await service.ensure_subscription(self.session, self.user_id, NOW)

        self.assertIs(result, existing)
        self.add_event.assert_not_awaited()

    async def test_existing_paid_subscription_is_left_alone(self):
        paid = sub()
        self.get.return_value = paid

        result = await service.ensure_subscription(self.session, self.user_id, NOW)

        self.assertIs(result, paid)
        self.create.assert_not_awaited()
        self.session.flush.assert_not_awaited()
        self.assertEqual(paid.current_period_start, NOW - 10 * DAY)

    async def test_stale_free_window_is_moved_forward_and_saved(self):
        stale = sub(
            plan_code="start",
            current_period_start=NOW - 40 * DAY,
            current_period_end=NOW - 10 * DAY,
        )
        self.get.return_value = stale

        await service.ensure_subscription(self.session, self.user_id, NOW)

        self.assertEqual(stale.current_period_start, NOW - 10 * DAY)
        self.assertEqual(stale.current_period_end, NOW + 20 * DAY)
        self.session.flush.assert_awaited_once()

    async def test_current_free_window_is_not_rewritten(self):
        current = sub(
            plan_code="start", current_period_start=NOW - DAY, current_period_end=NOW + 29 * DAY
        )
        self.get.return_value = current

        await service.ensure_subscription(self.session, self.user_id, NOW)

        self.session.flush.assert_not_awaited()


class GetEntitlementsTests(unittest.IsolatedAsyncioTestCase):
    def tearDown(self):
        patch.stopall()

    async def test_billing_off_means_no_limits_and_no_database_access(self):
        get = patch.object(service.billing_repository, "get_subscription", AsyncMock()).start()
        patch.object(service.settings, "BILLING_ENABLED", False).start()

        ent = await service.get_entitlements(session_mock(), uuid.uuid4(), NOW)

        self.assertEqual(ent.plan.code, PLAN_UNLIMITED)
        self.assertFalse(ent.billing_enabled)
        get.assert_not_awaited()

    async def test_billing_on_uses_the_stored_subscription(self):
        patch.object(service.settings, "BILLING_ENABLED", True).start()
        patch.object(service.settings, "BILLING_PAST_DUE_GRACE_DAYS", 3).start()
        patch.object(service, "ensure_subscription", AsyncMock(return_value=sub())).start()

        ent = await service.get_entitlements(session_mock(), uuid.uuid4(), NOW)

        self.assertIs(ent.plan, RESEARCHER)
        self.assertTrue(ent.billing_enabled)


class SubscriptionSummaryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user = SimpleNamespace(id=uuid.uuid4(), deletion_requested_at=None)
        self.session = session_mock()
        self.addCleanup(patch.stopall)

    def enable(self, enforce=False, subscription=None):
        patch.object(service.settings, "BILLING_ENABLED", True).start()
        patch.object(service.settings, "BILLING_ENFORCE", enforce).start()
        patch.object(service.settings, "BILLING_PAST_DUE_GRACE_DAYS", 3).start()
        patch.object(
            service, "ensure_subscription", AsyncMock(return_value=subscription or sub())
        ).start()
        self.pending = patch.object(
            service.plan_request_repository, "get_pending_for_user", AsyncMock(return_value=None)
        ).start()
        survey_repo = service.survey_repository
        self.open_surveys = patch.object(
            survey_repo, "count_open_surveys_for_owner", AsyncMock(return_value=0)
        ).start()
        self.projects = patch.object(
            survey_repo, "count_projects_for_owner", AsyncMock(return_value=0)
        ).start()
        self.locked = patch.object(
            survey_repo, "count_locked_for_owner", AsyncMock(return_value=0)
        ).start()
        return patch.object(
            service.billing_repository, "get_usage", AsyncMock(return_value={"ai_tokens": 4})
        ).start()

    async def test_summary_has_plan_period_and_usage(self):
        paid = sub(trial_used_at=NOW - 60 * DAY)
        get_usage = self.enable(subscription=paid)
        self.open_surveys.return_value = 2
        self.projects.return_value = 1
        self.locked.return_value = 4

        with patch.object(service, "datetime") as clock:
            clock.now.return_value = NOW
            result = await service.get_subscription_summary(self.session, self.user)

        self.assertTrue(result.billing_enabled)
        self.assertEqual((result.plan.code, result.plan.title), ("researcher", "Исследователь"))
        self.assertEqual(result.plan.limits.ai_tokens_per_period, 6_000_000)
        self.assertEqual(result.status, "active")
        self.assertEqual(result.current_period_end, NOW + 20 * DAY)
        self.assertTrue(result.trial_used)
        ai = result.usage.ai_tokens
        self.assertEqual((ai.used, ai.max, ai.resets_at), (4, 6_000_000, NOW + 20 * DAY))
        self.assertEqual(
            (result.usage.responses.used, result.usage.responses.max),
            (0, RESEARCHER.responses_per_period),
        )
        self.assertEqual(
            (result.usage.active_surveys.used, result.usage.active_surveys.max),
            (2, RESEARCHER.max_active_surveys),
        )
        self.assertEqual(
            (result.usage.projects.used, result.usage.projects.max), (1, RESEARCHER.max_projects)
        )
        self.assertEqual(result.usage.locked_responses, 4)
        # Once for the counters of the period, once for the window of the AI tokens
        self.assertEqual(get_usage.await_count, 2)
        get_usage.assert_awaited_with(self.session, self.user.id, NOW - 10 * DAY)
        self.session.commit.assert_awaited_once()

    async def test_the_free_allowance_has_no_date_it_comes_back(self):
        self.enable(subscription=sub(plan_code="start", billing_interval="none"))

        result = await service.get_subscription_summary(self.session, self.user)

        self.assertIsNone(result.usage.ai_tokens.resets_at)
        self.assertEqual(result.usage.ai_tokens.max, 150_000)

    async def test_shadow_mode_is_reported_as_not_enforced(self):
        self.enable(enforce=False)
        shadow = await service.get_subscription_summary(self.session, self.user)
        patch.stopall()

        self.enable(enforce=True)
        strict = await service.get_subscription_summary(self.session, self.user)

        self.assertFalse(shadow.enforced)
        self.assertTrue(strict.enforced)

    async def test_billing_off_reports_no_limits_without_touching_the_database(self):
        usage = patch.object(service.billing_repository, "get_usage", AsyncMock()).start()
        counts = patch.object(
            service.survey_repository, "count_open_surveys_for_owner", AsyncMock()
        ).start()
        locked = patch.object(
            service.survey_repository, "count_locked_for_owner", AsyncMock()
        ).start()
        patch.object(service.settings, "BILLING_ENABLED", False).start()
        patch.object(service.settings, "BILLING_ENFORCE", True).start()

        result = await service.get_subscription_summary(self.session, self.user)

        self.assertFalse(result.billing_enabled)
        self.assertFalse(result.enforced)
        self.assertEqual(result.plan.code, PLAN_UNLIMITED)
        self.assertEqual(result.usage.ai_tokens.used, 0)
        usage.assert_not_awaited()
        counts.assert_not_awaited()
        locked.assert_not_awaited()
        self.assertEqual(result.usage.locked_responses, 0)
        self.session.commit.assert_not_awaited()


class PlansResponseTests(unittest.IsolatedAsyncioTestCase):
    async def test_public_catalogue_lists_the_subscription_plans_and_the_pack_apart(self):
        result = await billing_routes.get_plans()

        self.assertEqual([plan.code for plan in result.plans], ["start", "researcher"])
        researcher = result.plans[1]
        self.assertEqual((researcher.price_month_kopecks, researcher.price_year_kopecks), (60_000, 540_000))
        self.assertEqual(
            researcher.features,
            ["all_methodologies", "crosstabs", "csv_export", "quality_filter"],
        )
        self.assertEqual(result.plans[0].features, [])
        self.assertEqual((result.pack_price_kopecks, result.pack_days), (25_000, 60))
        self.assertEqual(result.pack.code, "pack")
        self.assertEqual(result.pack.limits.ai_tokens_per_period, 2_000_000)
        self.assertEqual(result.pack.features, ["all_methodologies", "csv_export"])

    async def test_the_token_allowance_of_every_plan_is_published(self):
        result = await billing_routes.get_plans()

        self.assertEqual(
            [plan.limits.ai_tokens_per_period for plan in result.plans], [150_000, 6_000_000]
        )

    async def test_internal_limits_are_not_exposed(self):
        result = await billing_routes.get_plans()

        self.assertEqual(
            set(result.plans[0].limits.model_dump()),
            {
                "max_active_surveys",
                "max_projects",
                "max_questions",
                "responses_per_period",
                "max_analyzed_responses",
                "ai_tokens_per_period",
            },
        )


if __name__ == "__main__":
    unittest.main()
