from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from app.constants.billing_plans import PACK, RESEARCHER, START, seat_model_plan
from app.services import ai_pool
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
        seats_count=1,
        seat_window_ends_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


class SeatModelPlanTests(unittest.TestCase):
    def test_a_seat_brings_two_million_and_the_base_model_weighs_a_fifth(self):
        for seats, quota in ((1, 2_000_000), (2, 4_000_000), (3, 6_000_000), (10, 20_000_000)):
            with self.subTest(seats=seats):
                plan = seat_model_plan(RESEARCHER, seats)
                self.assertEqual((plan.ai_tokens_per_period, plan.base_model_weight), (quota, 0.2))

    def test_the_trial_is_a_part_of_one_seat(self):
        plan = seat_model_plan(RESEARCHER, 5, trialing=True)
        self.assertEqual(plan.ai_tokens_per_period, 933_333)

    def test_the_pack_is_one_million(self):
        self.assertEqual(seat_model_plan(PACK).ai_tokens_per_period, 1_000_000)
        self.assertEqual(seat_model_plan(PACK).base_model_weight, 0.2)

    def test_the_free_plan_is_left_alone(self):
        self.assertIs(seat_model_plan(START, 3), START)

    def test_the_catalogue_itself_is_not_changed(self):
        seat_model_plan(RESEARCHER, 3)
        self.assertEqual((RESEARCHER.ai_tokens_per_period, RESEARCHER.base_model_weight), (6_000_000, 1.0))


class EntitlementsTests(unittest.TestCase):
    def resolve(self, row, enabled):
        with patch.object(service.settings, "SEAT_PRICING_ENABLED", enabled):
            return service.resolve_entitlements(row, NOW, GRACE)

    def test_nothing_changes_while_the_switch_is_off(self):
        ent = self.resolve(sub(seats_count=3), False)
        self.assertEqual((ent.plan.ai_tokens_per_period, ent.plan.base_model_weight), (6_000_000, 1.0))
        self.assertEqual(ent.seats, 3)

    def test_the_pool_grows_with_the_seats_when_it_is_on(self):
        for seats in (1, 2, 5):
            with self.subTest(seats=seats):
                ent = self.resolve(sub(seats_count=seats), True)
                self.assertEqual(ent.plan.ai_tokens_per_period, 2_000_000 * seats)
                self.assertEqual(ent.seats, seats)

    def test_a_trial_gets_a_part_of_one_seat(self):
        row = sub(status="trialing", seats_count=1, trial_ends_at=NOW + 7 * DAY)
        self.assertEqual(self.resolve(row, True).plan.ai_tokens_per_period, 933_333)

    def test_an_override_of_the_administrator_wins(self):
        row = sub(seats_count=3, limit_overrides={"ai_tokens_per_period": 123})
        self.assertEqual(self.resolve(row, True).plan.ai_tokens_per_period, 123)

    def test_the_pack_and_the_free_plan(self):
        self.assertEqual(self.resolve(sub(plan_code="pack"), True).plan.ai_tokens_per_period, 1_000_000)
        free = sub(plan_code="start", billing_interval="none", seats_count=1)
        self.assertEqual(self.resolve(free, True).plan.ai_tokens_per_period, START.ai_tokens_per_period)

    def test_a_year_gets_the_quota_month_by_month_and_not_in_advance(self):
        start = NOW - 70 * DAY
        row = sub(
            billing_interval="year",
            seats_count=2,
            current_period_start=start,
            current_period_end=start + 365 * DAY,
        )

        ent = self.resolve(row, True)

        # The third month of the year: the counter starts over every 30 days, the pool is two seats
        self.assertEqual(ent.ai_window_start, start + 60 * DAY)
        self.assertEqual(ent.ai_window_end, start + 90 * DAY)
        self.assertEqual(ent.plan.ai_tokens_per_period, 4_000_000)

    def test_the_last_window_of_a_year_does_not_run_past_the_paid_period(self):
        start = NOW - 362 * DAY
        row = sub(billing_interval="year", current_period_start=start, current_period_end=start + 365 * DAY)

        ent = self.resolve(row, True)

        # The thirteenth window has only five days left of the paid year
        self.assertEqual(ent.ai_window_start, start + 360 * DAY)
        self.assertEqual(ent.ai_window_end, start + 365 * DAY)

    def test_an_expired_plan_falls_back_to_the_free_one(self):
        ent = self.resolve(sub(current_period_end=NOW - 10 * DAY, status="active"), True)
        self.assertEqual(ent.plan.code, "start")
        self.assertEqual(ent.plan.ai_tokens_per_period, START.ai_tokens_per_period)


class PlansResponseTests(unittest.TestCase):
    def test_the_public_numbers_follow_the_switch(self):
        for enabled, researcher, pack in ((False, 6_000_000, 2_000_000), (True, 2_000_000, 1_000_000)):
            with self.subTest(enabled=enabled), patch.object(
                service.settings, "SEAT_PRICING_ENABLED", enabled
            ):
                response = service.build_plans_response()
                shown = {plan.code: plan.limits.ai_tokens_per_period for plan in response.plans}
                self.assertEqual(shown["researcher"], researcher)
                self.assertEqual(response.pack.limits.ai_tokens_per_period, pack)


class QuoteRouteTests(unittest.IsolatedAsyncioTestCase):
    async def quote(self, term="month", seats=1, enabled=True):
        from app.api.routes import billing as routes

        with patch.object(routes.settings, "SEAT_PRICING_ENABLED", enabled):
            return await routes.get_quote(term=term, seats=seats)

    async def test_the_price_page_gets_the_same_numbers_as_the_payment(self):
        for term, seats, total in (
            ("month", 1, 600_00),
            ("month", 3, 1200_00),
            ("month", 4, 1620_00),
            ("year", 1, 6336_00),
            ("year", 3, 12672_00),
        ):
            with self.subTest(term=term, seats=seats):
                result = await self.quote(term, seats)
                self.assertEqual((result.total_kopecks, result.seats), (total, seats))
                self.assertEqual(sum(line.kopecks for line in result.lines), result.subtotal_kopecks)

    async def test_a_year_tells_how_much_it_saves(self):
        result = await self.quote("year", 3)
        self.assertEqual(result.year_saving_kopecks, 12 * 1200_00 - 12672_00)

    async def test_it_is_closed_while_the_seat_switch_is_off_and_for_a_bad_number(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as off:
            await self.quote(enabled=False)
        self.assertEqual((off.exception.status_code, off.exception.detail["code"]), (422, "seats_unavailable"))

        with self.assertRaises(HTTPException) as bad:
            await self.quote(seats=11)
        self.assertEqual(bad.exception.detail["code"], "invalid_seats")


class PlansExtraFieldsTests(unittest.TestCase):
    def test_the_response_says_how_the_plans_are_sold_and_what_the_extra_pack_is(self):
        for enabled in (False, True):
            with self.subTest(enabled=enabled), patch.object(
                service.settings, "SEAT_PRICING_ENABLED", enabled
            ):
                response = service.build_plans_response()
                self.assertEqual(response.seat_pricing_enabled, enabled)
                self.assertEqual(response.max_seats, 10)
                self.assertEqual(
                    (response.addon_price_kopecks, response.addon_tokens, response.addon_days),
                    (300_00, 1_000_000, 90),
                )


class SeatWindowInEntitlementsTests(unittest.TestCase):
    def test_the_window_of_a_paid_team_is_passed_on_and_the_free_plan_has_none(self):
        end = NOW + 3 * DAY
        paid = service.resolve_entitlements(sub(seat_window_ends_at=end), NOW, GRACE)
        free = service.resolve_entitlements(
            sub(plan_code="start", billing_interval="none", seat_window_ends_at=end), NOW, GRACE
        )
        self.assertEqual(paid.seat_window_ends_at, end)
        self.assertIsNone(free.seat_window_ends_at)


class WeightTests(unittest.TestCase):
    def test_a_token_of_the_base_model_costs_a_fifth_of_a_token_plus(self):
        plan = seat_model_plan(RESEARCHER, 1)
        with patch.object(ai_pool.settings, "OPENROUTER_MODEL", "base/model"):
            self.assertEqual(ai_pool.charged_tokens(1000, "base/model", plan), 200)
            self.assertEqual(ai_pool.charged_tokens(1000, "strong/model", plan), 1000)
            self.assertEqual(ai_pool.charged_tokens(1, "base/model", plan), 1)


if __name__ == "__main__":
    unittest.main()
