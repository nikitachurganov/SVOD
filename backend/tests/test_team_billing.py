"""The team model of docs/MONETIZATION_TEAM_SPEC.md: the rules, the order of spending, the rights and the
acceptance scenarios of section 5 that do not need a database."""

from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.constants.billing_plans import (
    FEATURE_ALL_METHODOLOGIES,
    FEATURE_CROSSTABS,
    FEATURE_CSV_EXPORT,
    FEATURE_QUALITY_FILTER,
    PLAN_TEAM_PACK,
    PLAN_TEAM_PRO,
    PLAN_TEAM_PLUS,
    TEAM_FREE_TOKENS,
    TEAM_PACK_PRICE_KOPECKS,
    TEAM_PACK_TOKENS,
    TEAM_PLANS,
)
from app.core.config import Settings, settings
from app.models.payment import PAYMENT_SUCCEEDED
from app.services import payment_service, team_billing_service as tb, team_seat_service
from tests import test_payments as pay

UTC = timezone.utc
CREATED = datetime(2026, 8, 12, 9, 30, tzinfo=UTC)
NOW = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)
DAY = timedelta(days=1)
BASE = settings.OPENROUTER_MODEL
STRONG = "openai/test-strong"


def row(**overrides):
    data = dict(
        organization_id=uuid.uuid4(),
        plan_code=None,
        period_start=None,
        period_end=None,
        plan_tokens=0,
        purchased_tokens=0,
        permanent_tools_at=None,
        free_tokens=TEAM_FREE_TOKENS,
        free_cycle_start=datetime(2026, 10, 12, 9, 30, tzinfo=UTC),
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def subscribed(code=PLAN_TEAM_PLUS, plan_tokens=1_000, purchased=0, **overrides):
    return row(
        plan_code=code,
        period_start=NOW - 5 * DAY,
        period_end=NOW + 25 * DAY,
        plan_tokens=plan_tokens,
        purchased_tokens=purchased,
        **overrides,
    )


def state(r, now=NOW):
    return tb.view(r, CREATED, now)


class CatalogueTests(unittest.TestCase):
    def test_the_two_subscriptions_have_fixed_prices_quotas_and_seats(self):
        small, big = TEAM_PLANS[PLAN_TEAM_PLUS], TEAM_PLANS[PLAN_TEAM_PRO]
        self.assertEqual((small.price_kopecks, small.quota_tokens, small.seats), (49_900, 2_000_000, 3))
        self.assertEqual((big.price_kopecks, big.quota_tokens, big.seats), (139_900, 6_000_000, 10))

    def test_the_pack_is_99_roubles_for_500_thousand(self):
        self.assertEqual((TEAM_PACK_PRICE_KOPECKS, TEAM_PACK_TOKENS), (9_900, 500_000))


class FreeCycleTests(unittest.TestCase):
    def test_the_cycle_starts_on_the_day_the_team_was_made_not_on_the_first_of_the_month(self):
        start, end = tb.free_cycle(CREATED, datetime(2026, 11, 1, 0, 0, tzinfo=UTC))
        self.assertEqual((start.month, start.day), (10, 12))
        self.assertEqual((end.month, end.day), (11, 12))

    def test_a_team_made_on_the_12th_with_20_thousand_left_has_150_thousand_on_the_next_12th(self):
        old = row(free_tokens=20_000, free_cycle_start=datetime(2026, 10, 12, 9, 30, tzinfo=UTC))
        before = tb.view(old, CREATED, datetime(2026, 11, 12, 9, 29, tzinfo=UTC))
        after = tb.view(old, CREATED, datetime(2026, 11, 12, 9, 30, tzinfo=UTC))
        self.assertEqual(before.free_tokens, 20_000)
        self.assertEqual(after.free_tokens, TEAM_FREE_TOKENS)

    def test_the_first_of_the_calendar_month_does_not_renew_the_quota(self):
        old = row(free_tokens=20_000, free_cycle_start=datetime(2026, 10, 12, 9, 30, tzinfo=UTC))
        self.assertEqual(tb.view(old, CREATED, datetime(2026, 11, 1, 0, 0, tzinfo=UTC)).free_tokens, 20_000)

    def test_refresh_writes_the_new_cycle_into_the_row(self):
        old = row(free_tokens=20_000, free_cycle_start=datetime(2026, 10, 12, 9, 30, tzinfo=UTC))
        tb.refresh(old, CREATED, datetime(2026, 11, 13, tzinfo=UTC))
        self.assertEqual(old.free_tokens, TEAM_FREE_TOKENS)
        self.assertEqual(old.free_cycle_start, datetime(2026, 11, 12, 9, 30, tzinfo=UTC))

    def test_a_day_the_month_does_not_have_falls_on_its_last_day(self):
        created = datetime(2026, 1, 31, 8, 0, tzinfo=UTC)
        self.assertEqual(tb.add_months(created, 1), datetime(2026, 2, 28, 8, 0, tzinfo=UTC))
        self.assertEqual(tb.add_months(created, 2), datetime(2026, 3, 31, 8, 0, tzinfo=UTC))


class SpendingTests(unittest.TestCase):
    def test_the_subscription_is_spent_before_the_packs(self):
        self.assertEqual(tb.spend(100, 500, 250), (0, 350, 250))

    def test_nothing_goes_below_zero(self):
        self.assertEqual(tb.spend(10, 5, 100), (0, 0, 15))

    def test_a_thousand_tokens_cost_200_on_the_base_model_and_1000_on_a_strong_one(self):
        self.assertEqual(tb.charge_for(1_000, BASE, tb.AI_PAID), 200)
        self.assertEqual(tb.charge_for(1_000, STRONG, tb.AI_PAID), 1_000)

    def test_the_cost_is_rounded_up_and_never_zero_for_a_started_action(self):
        self.assertEqual(tb.charge_for(5, BASE, tb.AI_PAID), 1)
        self.assertEqual(tb.charge_for(6, BASE, tb.AI_PAID), 2)
        self.assertEqual(tb.charge_for(1, BASE, tb.AI_PAID), 1)
        self.assertEqual(tb.charge_for(0, BASE, tb.AI_PAID), 0)

    def test_the_free_tokens_count_one_to_one(self):
        self.assertEqual(tb.charge_for(1_000, BASE, tb.AI_FREE), 1_000)


class StateTests(unittest.TestCase):
    def test_a_free_team_uses_the_free_tokens_and_has_no_tools(self):
        s = state(row())
        self.assertEqual((s.ai_mode, s.features), (tb.AI_FREE, frozenset()))

    def test_a_pack_opens_the_methodologies_and_the_csv_but_not_the_comparison(self):
        s = state(row(purchased_tokens=500_000, permanent_tools_at=NOW))
        self.assertEqual(s.ai_mode, tb.AI_PAID)
        self.assertEqual(s.features, frozenset({FEATURE_CSV_EXPORT, FEATURE_ALL_METHODOLOGIES}))

    def test_a_subscription_opens_everything(self):
        s = state(subscribed())
        self.assertTrue({FEATURE_CROSSTABS, FEATURE_QUALITY_FILTER, FEATURE_CSV_EXPORT} <= s.features)

    def test_a_paid_month_with_both_balances_at_zero_stops_the_ai_and_leaves_the_free_tokens_alone(self):
        s = state(subscribed(plan_tokens=0, purchased=0))
        self.assertEqual(s.ai_mode, tb.AI_SUSPENDED)
        self.assertGreater(s.free_tokens, 0)

    def test_an_ended_subscription_closes_the_comparison_but_keeps_the_pack_and_the_tools(self):
        ended = subscribed(plan_tokens=900, purchased=60_000, permanent_tools_at=CREATED)
        ended.period_end = NOW - DAY
        s = state(ended)
        self.assertIsNone(s.plan)
        self.assertEqual(s.plan_tokens, 0)
        self.assertEqual(s.purchased_tokens, 60_000)
        self.assertNotIn(FEATURE_CROSSTABS, s.features)
        self.assertNotIn(FEATURE_QUALITY_FILTER, s.features)
        self.assertIn(FEATURE_CSV_EXPORT, s.features)
        self.assertEqual(s.ai_mode, tb.AI_PAID)

    def test_the_tools_stay_after_the_last_purchased_token_is_spent(self):
        s = state(row(purchased_tokens=0, permanent_tools_at=CREATED))
        self.assertEqual(s.features, frozenset({FEATURE_CSV_EXPORT, FEATURE_ALL_METHODOLOGIES}))
        self.assertEqual(s.ai_mode, tb.AI_FREE)

    def test_the_seats_come_from_the_plan_and_are_one_without_it(self):
        self.assertEqual(state(subscribed(PLAN_TEAM_PLUS)).seats, 3)
        self.assertEqual(state(subscribed(PLAN_TEAM_PRO)).seats, 10)
        self.assertEqual(state(row()).seats, 1)

    def test_the_entitlements_carry_the_team_rights_for_the_guards(self):
        ent = tb.entitlements_of(state(subscribed(PLAN_TEAM_PRO)))
        self.assertEqual((ent.plan.code, ent.seats), (PLAN_TEAM_PRO, 10))
        self.assertIn(FEATURE_CROSSTABS, ent.plan.features)


class SeatRoomTests(unittest.TestCase):
    def test_a_reader_fits_over_the_seats_but_a_fourth_editor_does_not(self):
        usage = team_seat_service.SeatUsage(seats_used=3, readers=1, seats_limit=3)
        self.assertEqual(team_seat_service.blocking_limit(usage, "editor"), team_seat_service.LIMIT_SEATS)
        self.assertIsNone(team_seat_service.blocking_limit(usage, "reader"))

    def test_the_senior_plan_holds_the_owner_and_nine_editors_and_still_a_reader(self):
        usage = team_seat_service.SeatUsage(seats_used=9, readers=0, seats_limit=10)
        self.assertIsNone(team_seat_service.blocking_limit(usage, "editor"))
        full = team_seat_service.SeatUsage(seats_used=10, readers=0, seats_limit=10)
        self.assertIsNone(team_seat_service.blocking_limit(full, "reader"))


class ModelChoiceTests(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(settings, "AI_STRONG_MODELS", STRONG)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_the_base_model_is_always_available(self):
        self.assertEqual(tb.resolve_model(None, state(row())), BASE)
        self.assertEqual(tb.resolve_model(BASE, state(row())), BASE)

    def test_a_strong_model_needs_tokens_plus(self):
        self.assertEqual(tb.resolve_model(STRONG, state(subscribed())), STRONG)
        self.assertEqual(tb.resolve_model(STRONG, state(row(purchased_tokens=1))), STRONG)
        with self.assertRaises(HTTPException) as ctx:
            tb.resolve_model(STRONG, state(row()))
        self.assertEqual((ctx.exception.status_code, ctx.exception.detail["code"]), (403, "model_locked"))

    def test_a_model_outside_the_list_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            tb.resolve_model("some/other-model", state(subscribed()))
        self.assertEqual(ctx.exception.detail["code"], "model_unknown")

    def test_the_choice_is_shown_only_while_there_are_tokens_plus(self):
        self.assertEqual(state(subscribed()).models_available(), (BASE, STRONG))
        self.assertEqual(state(row()).models_available(), (BASE,))
        self.assertEqual(state(subscribed(plan_tokens=0)).models_available(), (BASE,))


class AccessTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        enforce = patch.object(settings, "BILLING_ENFORCE", True)
        enforce.start()
        self.addCleanup(enforce.stop)

    async def access(self, r, model=None):
        with patch.object(tb, "get_state", AsyncMock(return_value=state(r))):
            return await tb.check_ai_access(MagicMock(), uuid.uuid4(), model, NOW)

    async def test_a_paid_month_with_no_tokens_plus_is_refused_with_the_reason(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.access(subscribed(plan_tokens=0, purchased=0))
        self.assertEqual((ctx.exception.status_code, ctx.exception.detail["code"]), (402, "ai_suspended"))
        self.assertTrue(ctx.exception.detail["can_buy"])

    async def test_a_pack_bought_in_such_a_month_brings_the_ai_back(self):
        result = await self.access(subscribed(plan_tokens=0, purchased=TEAM_PACK_TOKENS))
        self.assertEqual(result.mode, tb.AI_PAID)

    async def test_a_free_team_without_tokens_is_refused_until_the_next_cycle(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.access(row(free_tokens=0))
        self.assertEqual(ctx.exception.detail["code"], "limit_reached")

    async def test_the_shadow_mode_only_counts(self):
        with patch.object(settings, "BILLING_ENFORCE", False):
            result = await self.access(subscribed(plan_tokens=0))
        self.assertEqual(result.mode, tb.AI_SUSPENDED)


class ChargeTests(unittest.IsolatedAsyncioTestCase):
    async def charge(self, r, tokens, model=BASE):
        with patch.object(tb, "locked_row", AsyncMock(return_value=(r, CREATED))):
            return await tb.charge(MagicMock(), r.organization_id, tokens, model, NOW)

    async def test_a_thousand_tokens_of_the_base_model_take_200_from_the_subscription_first(self):
        r = subscribed(plan_tokens=1_000, purchased=500)
        taken = await self.charge(r, 1_000)
        self.assertEqual((taken.amount, r.plan_tokens, r.purchased_tokens), (200, 800, 500))

    async def test_the_action_that_outgrows_the_subscription_takes_the_rest_from_the_packs(self):
        r = subscribed(plan_tokens=100, purchased=500)
        taken = await self.charge(r, 250, model=STRONG)
        self.assertEqual((r.plan_tokens, r.purchased_tokens), (0, 350))
        self.assertEqual((taken.from_plan, taken.from_packs), (100, 150))

    async def test_a_balance_never_goes_negative_when_the_action_is_bigger_than_what_is_left(self):
        r = subscribed(plan_tokens=10, purchased=5)
        taken = await self.charge(r, 10_000, model=STRONG)
        self.assertEqual((r.plan_tokens, r.purchased_tokens, taken.amount), (0, 0, 15))

    async def test_a_suspended_team_is_not_charged_from_the_free_tokens(self):
        r = subscribed(plan_tokens=0, purchased=0)
        taken = await self.charge(r, 1_000)
        self.assertEqual((taken.amount, r.free_tokens), (0, TEAM_FREE_TOKENS))

    async def test_a_free_team_pays_with_the_free_tokens_one_to_one(self):
        r = row()
        taken = await self.charge(r, 1_000)
        self.assertEqual((taken.mode, r.free_tokens), (tb.AI_FREE, TEAM_FREE_TOKENS - 1_000))

    async def test_an_ended_month_burns_its_quota_when_the_row_is_refreshed(self):
        r = subscribed(plan_tokens=900, purchased=60_000)
        r.period_end = NOW - DAY
        tb.refresh(r, CREATED, NOW)
        self.assertEqual((r.plan_code, r.plan_tokens, r.purchased_tokens), (None, 0, 60_000))


class GrantTests(unittest.IsolatedAsyncioTestCase):
    async def grant(self, r, plan_code):
        payment = SimpleNamespace(organization_id=r.organization_id, plan_code=plan_code)
        with patch.object(tb, "locked_row", AsyncMock(return_value=(r, CREATED))):
            await tb.apply_payment(MagicMock(), payment, NOW)

    async def test_a_pack_adds_500_thousand_and_opens_the_tools_for_good(self):
        r = row()
        await self.grant(r, PLAN_TEAM_PACK)
        self.assertEqual(r.purchased_tokens, 500_000)
        self.assertEqual(r.permanent_tools_at, NOW)

    async def test_two_packs_make_a_million_and_keep_the_first_moment_of_the_right(self):
        r = row()
        await self.grant(r, PLAN_TEAM_PACK)
        later = r.permanent_tools_at
        await self.grant(r, PLAN_TEAM_PACK)
        self.assertEqual((r.purchased_tokens, r.permanent_tools_at), (1_000_000, later))

    async def test_a_pack_during_a_subscription_leaves_the_subscription_alone(self):
        r = subscribed(plan_tokens=700)
        await self.grant(r, PLAN_TEAM_PACK)
        self.assertEqual((r.plan_tokens, r.purchased_tokens), (700, 500_000))

    async def test_a_plan_sets_the_full_quota_for_a_month(self):
        r = row()
        await self.grant(r, PLAN_TEAM_PLUS)
        self.assertEqual(
            (r.plan_code, r.plan_tokens, r.period_end), (PLAN_TEAM_PLUS, 2_000_000, NOW + 30 * DAY)
        )

    async def test_a_renewal_refills_the_quota_and_keeps_the_packs(self):
        r = subscribed(plan_tokens=120_000, purchased=70_000)
        await self.grant(r, PLAN_TEAM_PLUS)
        self.assertEqual((r.plan_tokens, r.purchased_tokens), (2_000_000, 70_000))

    async def test_a_renewal_in_the_middle_of_the_month_adds_a_month_to_the_end(self):
        r = subscribed()
        end = r.period_end
        await self.grant(r, PLAN_TEAM_PLUS)
        self.assertEqual(r.period_end, end + 30 * DAY)

    async def test_another_plan_cannot_be_bought_while_one_is_running(self):
        with self.assertRaises(ValueError):
            await self.grant(subscribed(PLAN_TEAM_PLUS), PLAN_TEAM_PRO)


class TeamPaymentSettlementTests(unittest.IsolatedAsyncioTestCase):
    """A repeated confirmation of one payment gives one accrual; a second purchase is its own."""

    def setUp(self):
        self.session = MagicMock()
        self.session.commit = AsyncMock()
        self.user = SimpleNamespace(id=uuid.uuid4(), email="owner@example.com")
        self.org = uuid.uuid4()
        patcher = patch.object(
            payment_service.user_repository, "get_by_id", AsyncMock(return_value=self.user)
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def team_payment(self):
        return pay.our_payment(
            user_id=self.user.id,
            organization_id=self.org,
            plan_code=PLAN_TEAM_PACK,
            term="one_off",
            days=0,
            amount_kopecks=TEAM_PACK_PRICE_KOPECKS,
            status="pending",
            applied_at=None,
            refunded_kopecks=0,
        )

    async def test_a_repeated_confirmation_gives_one_accrual(self):
        payment = self.team_payment()
        provider = pay.provider_payment(amount_kopecks=TEAM_PACK_PRICE_KOPECKS)
        with patch.object(payment_service.team_billing_service, "apply_payment", AsyncMock()) as apply:
            first = await payment_service._apply(self.session, payment, provider, NOW)
            second = await payment_service._apply(self.session, payment, provider, NOW)
        self.assertEqual(apply.await_count, 1)
        self.assertEqual(
            (first.outcome, second.outcome, payment.status),
            (payment_service.OUTCOME_APPLIED, payment_service.OUTCOME_UNCHANGED, PAYMENT_SUCCEEDED),
        )

    async def test_the_second_own_purchase_is_a_second_accrual(self):
        with patch.object(payment_service.team_billing_service, "apply_payment", AsyncMock()) as apply:
            for _ in range(2):
                await payment_service._apply(
                    self.session,
                    self.team_payment(),
                    pay.provider_payment(amount_kopecks=TEAM_PACK_PRICE_KOPECKS),
                    NOW,
                )
        self.assertEqual(apply.await_count, 2)

    async def test_a_team_payment_writes_nothing_to_the_subscription_journal_of_the_payer(self):
        self.assertIsNone(payment_service._journal_owner(self.team_payment()))
        own = pay.our_payment(organization_id=None)
        self.assertEqual(payment_service._journal_owner(own), own.user_id)

    async def test_a_refund_of_a_team_payment_is_left_to_a_person(self):
        effect = await payment_service._take_back(
            self.session, self.team_payment(), NOW, whole_period=False
        )
        self.assertEqual(effect, payment_service.EFFECT_TEAM_MANUAL)


class CheckoutTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user = SimpleNamespace(id=uuid.uuid4(), email="owner@example.com")
        self.org = SimpleNamespace(id=uuid.uuid4(), name="Лаборатория")
        self.role = "owner"
        self.open_payment = AsyncMock(return_value="payment")
        patches = [
            patch.object(settings, "BILLING_ENABLED", True),
            patch.object(settings, "TEAM_BILLING_ENABLED", True),
            patch.object(Settings, "payments_enabled", property(lambda s: True)),
            patch.object(
                payment_service.organization_repository, "get_org_by_id", AsyncMock(return_value=self.org)
            ),
            patch.object(
                payment_service.organization_repository,
                "get_member",
                AsyncMock(side_effect=lambda *a: SimpleNamespace(role_tag=self.role)),
            ),
            patch.object(payment_service, "_open_payment", self.open_payment),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    async def buy(self, kind, current=None):
        with patch.object(
            payment_service.team_billing_service,
            "get_state",
            AsyncMock(return_value=current or tb.view(row(), CREATED, NOW)),
        ):
            return await payment_service.create_team_checkout(
                MagicMock(), self.user, self.org.id, kind, NOW
            )

    async def test_the_pack_is_charged_to_the_team_for_99_roubles(self):
        await self.buy("pack")
        args, kwargs = self.open_payment.await_args
        self.assertEqual((args[2], args[6]), (PLAN_TEAM_PACK, TEAM_PACK_PRICE_KOPECKS))
        self.assertEqual(kwargs["organization_id"], self.org.id)

    async def test_the_price_of_a_plan_is_fixed_whatever_the_seats(self):
        await self.buy(PLAN_TEAM_PLUS)
        self.assertEqual(self.open_payment.await_args.args[6], 49_900)
        await self.buy(PLAN_TEAM_PRO)
        self.assertEqual(self.open_payment.await_args.args[6], 139_900)

    async def test_only_the_owner_buys(self):
        self.role = "editor"
        with self.assertRaises(HTTPException) as ctx:
            await self.buy("pack")
        self.assertEqual(ctx.exception.detail["code"], "billing_forbidden")

    async def test_another_plan_is_not_sold_while_one_is_running(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.buy(PLAN_TEAM_PRO, tb.view(subscribed(PLAN_TEAM_PLUS), CREATED, NOW))
        self.assertEqual(ctx.exception.detail["code"], "plan_change_unavailable")

    async def test_an_unknown_offer_is_refused(self):
        with self.assertRaises(HTTPException):
            await self.buy("gold")


class SummaryTests(unittest.TestCase):
    def test_the_balances_are_shown_apart_with_their_dates(self):
        s = state(subscribed(plan_tokens=1_500, purchased=70_000, permanent_tools_at=CREATED))
        summary = tb.build_summary(uuid.uuid4(), s, can_buy=True)
        self.assertEqual(summary.subscription.remaining, 1_500)
        self.assertEqual(summary.subscription.resets_at, s.period_end)
        self.assertEqual(summary.purchased_tokens, 70_000)
        self.assertEqual(summary.free.quota, TEAM_FREE_TOKENS)
        self.assertEqual({o.kind for o in summary.offers}, {PLAN_TEAM_PLUS, PLAN_TEAM_PRO, "pack"})

    def test_the_other_plan_is_marked_unavailable_while_one_runs(self):
        s = state(subscribed(PLAN_TEAM_PLUS))
        offers = {o.kind: o for o in tb.build_summary(uuid.uuid4(), s, can_buy=True).offers}
        self.assertTrue(offers[PLAN_TEAM_PLUS].available)
        self.assertFalse(offers[PLAN_TEAM_PRO].available)
        self.assertTrue(offers["pack"].available)


if __name__ == "__main__":
    unittest.main()


class TeamModeRouteTests(unittest.IsolatedAsyncioTestCase):
    """With the team model on, the price list shows the team offers and the purchases of a person close."""

    def setUp(self):
        for name in ("BILLING_ENABLED", "TEAM_BILLING_ENABLED"):
            p = patch.object(settings, name, True)
            p.start()
            self.addCleanup(p.stop)

    async def test_the_price_list_carries_the_team_offers(self):
        from app.api.routes import billing as routes

        plans = await routes.get_plans()
        self.assertTrue(plans.team_billing_enabled)
        self.assertEqual({o.kind for o in plans.team_offers}, {PLAN_TEAM_PLUS, PLAN_TEAM_PRO, "pack"})
        self.assertEqual(plans.team_free_tokens, TEAM_FREE_TOKENS)

    async def test_the_purchases_of_a_person_are_closed(self):
        from app.api.routes import billing as routes

        for call in (
            lambda: routes.create_checkout(SimpleNamespace(term="month", seats=1, return_to=None), MagicMock(), MagicMock()),
            lambda: routes.buy_addon(MagicMock(), MagicMock()),
            lambda: routes.start_trial(MagicMock(), MagicMock()),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await call()
            self.assertEqual(ctx.exception.detail["code"], "team_billing_enabled")

    def test_a_locked_feature_names_the_offer_that_opens_it(self):
        from app.services import billing_service

        ent = tb.entitlements_of(state(row()))
        csv = billing_service.feature_locked_error(ent, FEATURE_CSV_EXPORT).detail
        compare = billing_service.feature_locked_error(ent, FEATURE_CROSSTABS).detail
        self.assertEqual((csv["upgrade_to"], compare["upgrade_to"]), ("pack", "plus"))
        self.assertIn("99 ₽", csv["message"])

    def test_full_seats_of_plus_lead_to_pro(self):
        from app.services import billing_service

        ent = tb.entitlements_of(state(subscribed(PLAN_TEAM_PLUS)))
        detail = billing_service.limit_reached_error(ent, "seats", 3, 3).detail
        self.assertEqual(detail["upgrade_to"], PLAN_TEAM_PRO)
        self.assertIn("Читателей", detail["message"])


class OperatorTests(unittest.IsolatedAsyncioTestCase):
    async def run_on(self, r, coro):
        with patch.object(tb, "locked_row", AsyncMock(return_value=(r, CREATED))), patch.object(
            tb, "get_state", AsyncMock(side_effect=lambda *a, **k: state(r))
        ):
            return await coro

    async def test_an_invoice_gives_a_month_like_a_payment(self):
        r = row()
        result = await self.run_on(r, tb.grant(MagicMock(), r.organization_id, PLAN_TEAM_PRO, NOW))
        self.assertEqual((result.plan.code, r.plan_tokens), (PLAN_TEAM_PRO, 6_000_000))

    async def test_a_refunded_pack_takes_back_only_what_is_left(self):
        r = row(purchased_tokens=200_000, permanent_tools_at=CREATED)
        await self.run_on(r, tb.revoke(MagicMock(), r.organization_id, "pack", NOW))
        self.assertEqual((r.purchased_tokens, r.permanent_tools_at), (0, CREATED))

    async def test_a_refunded_month_ends_now(self):
        r = subscribed(PLAN_TEAM_PLUS, plan_tokens=1_500_000)
        await self.run_on(r, tb.revoke(MagicMock(), r.organization_id, PLAN_TEAM_PLUS, NOW))
        self.assertEqual((r.plan_code, r.plan_tokens, r.period_end), (None, 0, NOW))
