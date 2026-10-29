from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.constants.billing_plans import AI_LIFETIME_ANCHOR, PACK, RESEARCHER, START
from app.core import metrics
from app.services import ai_meter, ai_usage, billing_service

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
PERIOD_START = NOW - timedelta(days=10)
PERIOD_END = NOW + timedelta(days=20)
SURVEY_ID = uuid.uuid4()


def ent(plan=START, billing_enabled=True):
    ai_start, ai_end = billing_service.ai_window(plan, PERIOD_START, PERIOD_END, NOW)
    return billing_service.Entitlements(
        plan=plan,
        status="active",
        billing_interval="none",
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        trial_ends_at=None,
        trial_used=False,
        cancel_at_period_end=False,
        billing_enabled=billing_enabled,
        ai_window_start=ai_start,
        ai_window_end=ai_end,
    )


def user(**overrides):
    data = dict(id=uuid.uuid4(), ai_enabled=True)
    data.update(overrides)
    return SimpleNamespace(**data)


def llm(prompt=100, completion=50, cost=0.001):
    """What the OpenRouter client does after a response while an action is running."""
    ai_usage.record(
        {"prompt_tokens": prompt, "completion_tokens": completion, "cost": cost}, "z-ai/glm-5.3-flash"
    )


def count(counter, *labels):
    return counter.labels(*labels)._value.get()


class MeterCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = MagicMock()
        self.session.commit = AsyncMock()
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=self.session)
        context.__aexit__ = AsyncMock(return_value=False)
        self.factory = MagicMock(return_value=context)
        patch.object(ai_meter, "async_session_factory", self.factory).start()

        repo = ai_meter.billing_repository
        self.add_usage = patch.object(repo, "add_usage", AsyncMock(return_value=150)).start()
        self.add_log = patch.object(repo, "add_ai_usage_log", AsyncMock()).start()
        self.get_usage = patch.object(repo, "get_usage", AsyncMock(return_value={})).start()
        self.spent = patch.object(repo, "sum_ai_cost_usd", AsyncMock(return_value=Decimal(0))).start()
        self.warn = patch.object(ai_meter.lifecycle, "warn_if_near_limit", AsyncMock()).start()
        self.entitlements = patch.object(
            ai_meter.billing_service, "get_entitlements", AsyncMock(return_value=ent())
        ).start()
        patch.object(ai_meter.settings, "BILLING_ENFORCE", True).start()
        patch.object(ai_meter.settings, "AI_DAILY_BUDGET_USD", 0.0).start()
        self.addCleanup(patch.stopall)
        self.user = user()

    async def run_action(self, body=None, who=None, name="ai_chat"):
        async with ai_meter.action(who or self.user, name, survey_id=SURVEY_ID) as collector:
            if body is not None:
                await body(collector)

    async def llm_body(self, _collector):
        llm()


class AccessTests(MeterCase):
    async def test_a_switched_off_account_is_refused_before_anything_else(self):
        ran = []

        async def body(_):
            ran.append(True)

        with self.assertRaises(HTTPException) as ctx:
            await self.run_action(body, who=user(ai_enabled=False))

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail["code"], "ai_disabled")
        self.assertEqual(ran, [])
        self.factory.assert_not_called()

    async def test_the_switch_works_even_with_billing_off(self):
        self.entitlements.return_value = ent(billing_enabled=False)

        with self.assertRaises(HTTPException) as ctx:
            await self.run_action(None, who=user(ai_enabled=False))

        self.assertEqual(ctx.exception.detail["code"], "ai_disabled")


class AllowanceTests(MeterCase):
    async def test_an_action_with_tokens_left_runs_and_is_charged_what_the_llm_used(self):
        ran = []

        async def body(_):
            ran.append(True)
            llm(prompt=100, completion=50)

        await self.run_action(body)

        self.assertEqual(ran, [True])
        args = self.add_usage.await_args.args
        self.assertEqual(args[1:], (self.user.id, "ai_tokens", AI_LIFETIME_ANCHOR, 150))

    async def test_the_free_allowance_is_counted_over_the_whole_life_of_the_account(self):
        await self.run_action(self.llm_body)

        self.assertEqual(self.get_usage.await_args.args[1:], (self.user.id, AI_LIFETIME_ANCHOR))

    async def test_a_subscription_is_counted_over_its_own_window(self):
        self.entitlements.return_value = ent(RESEARCHER)

        await self.run_action(self.llm_body)

        self.assertEqual(self.get_usage.await_args.args[1:], (self.user.id, PERIOD_START))
        self.assertEqual(self.add_usage.await_args.args[3], PERIOD_START)

    async def test_the_pack_is_counted_over_its_whole_term(self):
        self.entitlements.return_value = ent(PACK)

        await self.run_action(self.llm_body)

        self.assertEqual(self.get_usage.await_args.args[1:], (self.user.id, PERIOD_START))

    async def test_the_last_tokens_are_enough_to_start_an_action_that_overshoots(self):
        self.get_usage.return_value = {"ai_tokens": START.ai_tokens_per_period - 1}
        ran = []

        async def body(_):
            ran.append(True)
            llm(prompt=5_000, completion=2_000)

        await self.run_action(body)

        self.assertEqual(ran, [True])

    async def test_an_exhausted_allowance_refuses_with_402_and_nothing_runs(self):
        self.get_usage.return_value = {"ai_tokens": START.ai_tokens_per_period}
        ran = []

        async def body(_):
            ran.append(True)

        with self.assertRaises(HTTPException) as ctx:
            await self.run_action(body)

        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(
            ctx.exception.detail,
            {
                "code": "limit_reached",
                "limit": "ai_tokens",
                "used": START.ai_tokens_per_period,
                "max": START.ai_tokens_per_period,
                "plan": "start",
                "upgrade_to": "researcher",
                # The free allowance is never renewed
                "resets_at": None,
            },
        )
        self.assertEqual(ran, [])
        self.add_usage.assert_not_awaited()
        self.add_log.assert_not_awaited()

    async def test_an_exhausted_subscription_says_when_the_tokens_come_back(self):
        self.entitlements.return_value = ent(RESEARCHER)
        self.get_usage.return_value = {"ai_tokens": RESEARCHER.ai_tokens_per_period}

        with self.assertRaises(HTTPException) as ctx:
            await self.run_action(self.llm_body)

        self.assertEqual(ctx.exception.detail["plan"], "researcher")
        self.assertIsNone(ctx.exception.detail["upgrade_to"])
        self.assertEqual(ctx.exception.detail["resets_at"], PERIOD_END.isoformat())

    async def test_an_exhausted_pack_points_to_the_subscription(self):
        self.entitlements.return_value = ent(PACK)
        self.get_usage.return_value = {"ai_tokens": PACK.ai_tokens_per_period}

        with self.assertRaises(HTTPException) as ctx:
            await self.run_action(self.llm_body)

        self.assertEqual(ctx.exception.detail["upgrade_to"], "researcher")

    async def test_shadow_mode_counts_without_blocking(self):
        patch.object(ai_meter.settings, "BILLING_ENFORCE", False).start()
        self.get_usage.return_value = {"ai_tokens": START.ai_tokens_per_period + 1}
        before = count(metrics.BILLING_LIMIT_HIT, "ai_tokens", "start", "false")
        ran = []

        async def body(_):
            ran.append(True)
            llm()

        await self.run_action(body)

        self.assertEqual(ran, [True])
        self.add_usage.assert_awaited_once()
        after = count(metrics.BILLING_LIMIT_HIT, "ai_tokens", "start", "false")
        self.assertEqual(after - before, 1)

    async def test_billing_off_charges_nothing_but_still_writes_the_log(self):
        self.entitlements.return_value = ent(billing_enabled=False)

        await self.run_action(self.llm_body)

        self.get_usage.assert_not_awaited()
        self.add_usage.assert_not_awaited()
        self.spent.assert_not_awaited()
        self.add_log.assert_awaited_once()

    async def test_the_owner_is_warned_when_the_charge_crosses_eighty_percent(self):
        self.add_usage.return_value = 130_000

        async def body(_):
            llm(prompt=100_000, completion=30_000)

        await self.run_action(body)

        args, kwargs = self.warn.await_args
        self.assertEqual(
            args[1:],
            (self.user.id, "ai_tokens", 130_000, START.ai_tokens_per_period, AI_LIFETIME_ANCHOR),
        )
        self.assertEqual(kwargs, {"previous": 0})


class DailyCapTests(MeterCase):
    async def test_the_service_wide_cap_refuses_with_503_even_with_billing_off(self):
        self.entitlements.return_value = ent(billing_enabled=False)
        patch.object(ai_meter.settings, "AI_DAILY_BUDGET_USD", 5.0).start()
        self.spent.return_value = Decimal("5.0")
        ran = []

        async def body(_):
            ran.append(True)

        with self.assertRaises(HTTPException) as ctx:
            await self.run_action(body)

        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(ctx.exception.detail["code"], "ai_budget_exceeded")
        self.assertEqual(ran, [])
        since = self.spent.await_args.kwargs["since"]
        self.assertLess(abs(datetime.now(timezone.utc) - timedelta(hours=24) - since), timedelta(seconds=30))

    async def test_under_the_cap_the_action_runs(self):
        patch.object(ai_meter.settings, "AI_DAILY_BUDGET_USD", 5.0).start()
        self.spent.return_value = Decimal("4.99")

        await self.run_action(self.llm_body)

        self.add_log.assert_awaited_once()

    async def test_without_a_cap_the_total_is_not_even_queried(self):
        self.entitlements.return_value = ent(billing_enabled=False)

        await self.run_action(self.llm_body)

        self.spent.assert_not_awaited()


class SettlementTests(MeterCase):
    async def test_a_delivered_action_is_logged_and_charged_with_all_its_tokens(self):
        async def body(_):
            llm(prompt=100, completion=50, cost=0.001)
            llm(prompt=200, completion=70, cost=0.002)

        await self.run_action(body, name="survey_build")

        self.assertEqual(self.add_usage.await_args.args[4], 420)
        kwargs = self.add_log.await_args.kwargs
        self.assertEqual(kwargs["user_id"], self.user.id)
        self.assertEqual(kwargs["survey_id"], SURVEY_ID)
        self.assertEqual(kwargs["action"], "survey_build")
        self.assertEqual((kwargs["calls"], kwargs["prompt_tokens"], kwargs["completion_tokens"]), (2, 300, 120))
        self.assertEqual(kwargs["cost_usd"], Decimal("0.003"))
        self.assertEqual((kwargs["model"], kwargs["status"]), ("z-ai/glm-5.3-flash", "ok"))
        self.session.commit.assert_awaited()

    async def test_a_failure_after_the_llm_is_not_charged_but_keeps_the_cost_in_the_log(self):
        async def body(_):
            llm()
            raise RuntimeError("answer could not be parsed")

        with self.assertRaises(RuntimeError):
            await self.run_action(body)

        self.add_usage.assert_not_awaited()
        self.assertEqual(self.add_log.await_args.kwargs["status"], "failed")

    async def test_a_failure_before_the_llm_costs_nothing(self):
        async def body(_):
            raise HTTPException(status_code=502, detail="AI unavailable")

        with self.assertRaises(HTTPException):
            await self.run_action(body)

        self.add_usage.assert_not_awaited()
        self.add_log.assert_not_awaited()

    async def test_an_action_that_never_called_the_llm_is_not_charged(self):
        async def body(_):
            return None

        await self.run_action(body)

        self.add_usage.assert_not_awaited()
        self.add_log.assert_not_awaited()

    async def test_with_billing_off_a_failure_still_leaves_a_log_row(self):
        self.entitlements.return_value = ent(billing_enabled=False)

        async def body(_):
            llm()
            raise RuntimeError("boom")

        with self.assertRaises(RuntimeError):
            await self.run_action(body)

        self.add_usage.assert_not_awaited()
        self.add_log.assert_awaited_once()

    async def test_a_bookkeeping_failure_does_not_take_the_answer_away(self):
        self.add_usage.side_effect = RuntimeError("database is down")
        results = []

        async def body(_):
            llm()
            results.append("answer")

        with self.assertLogs(ai_meter.logger, level="ERROR"):
            await self.run_action(body)

        self.assertEqual(results, ["answer"])

    async def test_the_collector_is_active_only_inside_the_action(self):
        seen = []

        async def body(collector):
            seen.append(ai_usage._current.get() is collector)
            llm()

        self.assertIsNone(ai_usage._current.get())
        await self.run_action(body)

        self.assertEqual(seen, [True])
        self.assertIsNone(ai_usage._current.get())

    async def test_the_collector_is_released_after_a_failure_too(self):
        async def body(_):
            raise RuntimeError("boom")

        with self.assertRaises(RuntimeError):
            await self.run_action(body)

        self.assertIsNone(ai_usage._current.get())

    async def test_metrics_follow_the_action(self):
        labels = ("ai_chat",)
        actions = count(metrics.AI_ACTIONS, "ai_chat", "ok")
        prompt = count(metrics.AI_TOKENS, "prompt", *labels)
        completion = count(metrics.AI_TOKENS, "completion", *labels)
        cost = count(metrics.AI_COST_USD, *labels)

        async def body(_):
            llm(prompt=100, completion=50, cost=0.25)

        await self.run_action(body)

        self.assertEqual(count(metrics.AI_ACTIONS, "ai_chat", "ok") - actions, 1)
        self.assertEqual(count(metrics.AI_TOKENS, "prompt", *labels) - prompt, 100)
        self.assertEqual(count(metrics.AI_TOKENS, "completion", *labels) - completion, 50)
        self.assertAlmostEqual(count(metrics.AI_COST_USD, *labels) - cost, 0.25)


class LimitErrorTests(unittest.TestCase):
    def test_subscription_has_nowhere_to_upgrade_to(self):
        error = billing_service.limit_reached_error(ent(RESEARCHER), "ai_tokens", 6_000_000, 6_000_000)

        self.assertEqual(error.status_code, 402)
        self.assertEqual(error.detail["plan"], "researcher")
        self.assertIsNone(error.detail["upgrade_to"])

    def test_free_plan_and_pack_point_to_the_subscription(self):
        for plan in (START, PACK):
            with self.subTest(plan=plan.code):
                error = billing_service.limit_reached_error(ent(plan), "ai_tokens", 1, 1)

                self.assertEqual(error.detail["upgrade_to"], "researcher")
                self.assertEqual(error.detail["resets_at"], PERIOD_END.isoformat())


if __name__ == "__main__":
    unittest.main()
