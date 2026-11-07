from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.constants.billing_plans import RESEARCHER
from app.models.payment import PAYMENT_SUCCEEDED
from app.repositories import token_grant_repository
from app.services import payment_service
from tests import test_ai_meter as base
from tests import test_payments as pay

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
DAY = timedelta(days=1)
QUOTA = RESEARCHER.ai_tokens_per_period


class MeterWithPacksTests(base.MeterCase):
    def setUp(self):
        super().setUp()
        self.entitlements.return_value = base.ent(RESEARCHER)

    async def test_the_packs_are_not_asked_while_the_quota_lasts(self):
        self.get_usage.return_value = {"ai_tokens": QUOTA - 1}

        await self.run_action(self.llm_body)

        self.pack_left.assert_not_awaited()

    async def test_a_used_up_quota_with_a_pack_left_lets_the_action_run(self):
        self.get_usage.return_value = {"ai_tokens": QUOTA}
        self.pack_left.return_value = 500
        self.add_usage.return_value = QUOTA + 150

        await self.run_action(self.llm_body)

        # The whole action (150) is above the quota: it comes out of the pack
        self.assertEqual(self.pack_spent.await_args.args[2], 150)

    async def test_a_used_up_quota_without_a_pack_stops_the_action(self):
        self.get_usage.return_value = {"ai_tokens": QUOTA}
        self.pack_left.return_value = 0

        with self.assertRaises(HTTPException) as ctx:
            await self.run_action(self.llm_body)

        self.assertEqual((ctx.exception.status_code, ctx.exception.detail["limit"]), (402, "ai_tokens"))

    async def test_only_the_part_above_the_quota_comes_out_of_the_pack(self):
        self.get_usage.return_value = {"ai_tokens": QUOTA - 100}
        # 150 are charged and the counter ends 50 above the quota
        self.add_usage.return_value = QUOTA + 50

        await self.run_action(self.llm_body)

        self.assertEqual(self.pack_spent.await_args.args[2], 50)

    async def test_an_action_inside_the_quota_takes_nothing_from_the_pack(self):
        self.get_usage.return_value = {"ai_tokens": 0}
        self.add_usage.return_value = 150

        await self.run_action(self.llm_body)

        self.pack_spent.assert_not_awaited()


class WhoIsToPayTests(base.MeterCase):
    """The 402 says whether the person can pay for it or has to turn to the owner of the team."""

    def setUp(self):
        super().setUp()
        self.entitlements.return_value = base.ent(RESEARCHER)
        self.get_usage.return_value = {"ai_tokens": QUOTA}
        self.org = uuid.uuid4()

    async def run_in_team(self, payer):
        with patch.object(base.ai_meter.ai_pool, "resolve_payer", AsyncMock(return_value=payer)):
            async with base.ai_meter.action(
                self.user, "ai_chat", survey_id=base.SURVEY_ID, organization_id=self.org
            ):
                base.llm()

    async def test_a_member_of_a_team_is_sent_to_the_owner_when_the_pool_is_empty(self):
        pool = base.ai_meter.ai_pool.Payer(user_id=uuid.uuid4(), organization_id=self.org, pooled=True)

        with self.assertRaises(HTTPException) as ctx:
            await self.run_in_team(pool)

        self.assertIs(ctx.exception.detail["team_member"], True)

    async def test_a_personal_cap_that_is_used_up_also_means_the_owner(self):
        owner = uuid.uuid4()
        cap = base.ai_meter.ai_pool.MemberCap(self.user.id, self.org, 1000)
        pool = base.ai_meter.ai_pool.Payer(user_id=owner, organization_id=self.org, cap=cap, pooled=True)
        # The pool still has room, the cap of the member does not
        self.get_usage.side_effect = [{"ai_tokens": 0}, {cap.metric: 1000}]

        with self.assertRaises(HTTPException) as ctx:
            await self.run_in_team(pool)

        self.assertEqual(ctx.exception.detail["limit"], "ai_member_tokens")
        self.assertIs(ctx.exception.detail["team_member"], True)

    async def test_the_owner_of_the_pool_pays_for_themselves(self):
        pool = base.ai_meter.ai_pool.Payer(user_id=self.user.id, organization_id=self.org, pooled=True)

        with self.assertRaises(HTTPException) as ctx:
            await self.run_in_team(pool)

        self.assertIs(ctx.exception.detail["team_member"], False)


class Result:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


def grant(amount, used, expires_in_days):
    return SimpleNamespace(
        amount=amount, used=used, expires_at=NOW + expires_in_days * DAY, created_at=NOW - DAY
    )


class ConsumeTests(unittest.IsolatedAsyncioTestCase):
    async def consume(self, rows, tokens):
        session = MagicMock()
        session.execute = AsyncMock(return_value=Result(rows))
        return await token_grant_repository.consume(session, uuid.uuid4(), tokens, NOW)

    async def test_the_pack_that_expires_first_is_spent_first(self):
        first, second = grant(1000, 0, 10), grant(1000, 0, 80)

        taken = await self.consume([first, second], 1500)

        self.assertEqual((taken, first.used, second.used), (1500, 1000, 500))

    async def test_a_partly_spent_pack_gives_only_what_is_left(self):
        row = grant(1000, 900, 10)

        taken = await self.consume([row], 500)

        self.assertEqual((taken, row.used), (100, 1000))

    async def test_no_packs_no_spending(self):
        self.assertEqual(await self.consume([], 500), 0)
        self.assertEqual(await self.consume([grant(10, 0, 5)], 0), 0)


class AddonPurchaseTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = pay.session_mock()
        self.person = pay.user()
        self.added = []

        async def add(session, payment):
            self.added.append(payment)
            payment.id = payment.id or uuid.uuid4()
            return payment

        patch.object(payment_service.payment_repository, "add", add).start()
        patch.object(
            payment_service.payment_repository, "find_open_checkout", AsyncMock(return_value=None)
        ).start()
        self.create = patch.object(
            payment_service.yookassa_client,
            "create_payment",
            AsyncMock(
                return_value=pay.provider_payment(
                    status="pending", paid=False, confirmation_url="https://pay.example/1", is_test=True
                )
            ),
        ).start()
        self.active = patch.object(
            payment_service.lifecycle,
            "active_paid_subscription",
            AsyncMock(return_value=SimpleNamespace(plan_code="researcher")),
        ).start()
        patch.object(payment_service.settings, "BILLING_ENABLED", True).start()
        patch.object(payment_service.settings, "YOOKASSA_SHOP_ID", "shop").start()
        patch.object(payment_service.settings, "YOOKASSA_SECRET_KEY", "secret").start()
        patch.object(payment_service.settings, "SEAT_PRICING_ENABLED", True).start()
        self.addCleanup(patch.stopall)

    async def refused(self, code):
        with self.assertRaises(HTTPException) as ctx:
            await payment_service.create_addon(self.session, self.person, NOW)
        self.assertEqual(ctx.exception.detail["code"], code)
        self.assertEqual(self.added, [])
        self.create.assert_not_awaited()

    async def test_the_pack_costs_three_hundred_and_lasts_ninety_days(self):
        payment = await payment_service.create_addon(self.session, self.person, NOW)

        self.assertEqual(
            (payment.plan_code, payment.term, payment.amount_kopecks, payment.days, payment.seats),
            ("addon", "addon", 300_00, 90, 1),
        )
        self.assertEqual(self.create.await_args.kwargs["amount_kopecks"], 300_00)

    async def test_it_is_sold_on_top_of_a_running_plan_only(self):
        self.active.return_value = None
        await self.refused("no_active_subscription")

    async def test_it_is_refused_while_the_switch_or_the_payments_are_off(self):
        with patch.object(payment_service.settings, "SEAT_PRICING_ENABLED", False):
            await self.refused("addon_unavailable")
        with patch.object(payment_service.settings, "BILLING_ENABLED", False):
            await self.refused("payments_disabled")


class AddonSettleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.person = pay.user()
        self.row = pay.our_payment(
            user_id=self.person.id,
            plan_code="addon",
            term="addon",
            days=90,
            amount_kopecks=300_00,
        )
        patch.object(
            payment_service.user_repository, "get_by_id", AsyncMock(return_value=self.person)
        ).start()
        self.add = patch.object(payment_service.token_grant_repository, "add", AsyncMock()).start()
        self.revoke = patch.object(
            payment_service.token_grant_repository, "revoke_for_payment", AsyncMock(return_value=1)
        ).start()
        self.grant = patch.object(payment_service.lifecycle, "grant", AsyncMock()).start()
        patch.object(payment_service, "_journal", AsyncMock()).start()
        patch.object(payment_service, "_close_plan_request", AsyncMock()).start()
        patch.object(
            payment_service.payment_repository,
            "get_by_provider_id",
            AsyncMock(side_effect=lambda *a, **k: self.row),
        ).start()
        self.addCleanup(patch.stopall)

    def paid(self, **overrides):
        return pay.provider_payment(amount_kopecks=300_00, **overrides)

    async def test_a_paid_pack_becomes_a_block_of_a_million_for_ninety_days(self):
        result = await payment_service.settle(MagicMock(), self.paid(), NOW)

        self.assertEqual(result.outcome, "applied")
        self.assertIsNone(result.subscription)
        block = self.add.await_args.args[1]
        self.assertEqual(
            (block.user_id, block.kind, block.amount, block.payment_id, block.expires_at),
            (self.person.id, "addon", 1_000_000, self.row.id, NOW + 90 * DAY),
        )
        self.grant.assert_not_awaited()
        self.assertEqual(self.row.status, PAYMENT_SUCCEEDED)

    async def test_the_same_news_twice_gives_one_block(self):
        await payment_service.settle(MagicMock(), self.paid(), NOW)
        self.add.reset_mock()

        again = await payment_service.settle(MagicMock(), self.paid(), NOW + timedelta(minutes=1))

        self.assertEqual(again.outcome, "unchanged")
        self.add.assert_not_awaited()

    async def test_a_full_refund_takes_the_pack_back(self):
        await payment_service.settle(MagicMock(), self.paid(), NOW)

        result = await payment_service.settle(
            MagicMock(), self.paid(refunded_kopecks=300_00), NOW + DAY
        )

        self.assertEqual(result.outcome, "refunded")
        self.revoke.assert_awaited_once()
        self.assertEqual(self.revoke.await_args.args[1], self.row.id)

    async def test_a_partial_refund_leaves_the_pack(self):
        await payment_service.settle(MagicMock(), self.paid(), NOW)

        await payment_service.settle(MagicMock(), self.paid(refunded_kopecks=100_00), NOW + DAY)

        self.revoke.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
