"""A full refund takes back what the payment gave: the paid period, the seats, or nothing when there is nothing."""

from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import billing_mail
from app.services import subscription_lifecycle_service as lifecycle

NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)
DAY = timedelta(days=1)


def sub(**overrides):
    data = dict(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        plan_code="researcher",
        status="active",
        current_period_end=NOW + 20 * DAY,
        seats_count=1,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


class RevokeForRefundTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.sub = sub()
        self.get = patch.object(
            lifecycle.billing_repository, "get_subscription", AsyncMock(side_effect=lambda *a: self.sub)
        ).start()
        self.find = patch.object(lifecycle.billing_repository, "find_event", AsyncMock(return_value=None)).start()
        self.add_event = patch.object(lifecycle.billing_repository, "add_event", AsyncMock()).start()
        self.expire = patch.object(lifecycle, "expire_subscription", AsyncMock(return_value=0)).start()
        self.session = MagicMock()
        self.session.flush = AsyncMock()
        self.addCleanup(patch.stopall)
        self.pid = uuid.uuid4()

    async def run_it(self, **kw):
        args = dict(plan_code="researcher", seats_added=False, days=30, payment_id=self.pid, now=NOW)
        args.update(kw)
        return await lifecycle.revoke_for_refund(self.session, uuid.uuid4(), **args)

    def kinds(self):
        return [c.kwargs["kind"] for c in self.add_event.await_args_list]

    async def test_a_single_payment_refunded_puts_the_person_on_the_free_plan(self):
        # paid 10 days ago for 30: the end is 20 days away, taking the 30 days off leaves the past
        result = await self.run_it()

        self.assertEqual(result, "expired")
        self.expire.assert_awaited_once()
        self.assertEqual(self.expire.await_args.args[1:3], (self.sub, NOW))
        self.assertEqual(self.expire.await_args.args[3], "refunded")
        self.assertEqual(self.kinds(), ["refund_revoked"])

    async def test_one_of_two_months_in_a_row_shortens_the_period(self):
        self.sub.current_period_end = NOW + 40 * DAY

        result = await self.run_it()

        self.assertEqual(result, "shortened")
        self.assertEqual(self.sub.current_period_end, NOW + 10 * DAY)
        self.expire.assert_not_awaited()
        self.assertEqual(self.kinds(), ["refund_revoked"])

    async def test_a_refund_of_a_part_ends_the_paid_period_even_when_more_is_paid_ahead(self):
        self.sub.current_period_end = NOW + 40 * DAY

        result = await self.run_it(whole_period=True)

        self.assertEqual(result, "expired")
        self.expire.assert_awaited_once()

    async def test_a_year_payment_takes_its_whole_year(self):
        self.sub.current_period_end = NOW + 300 * DAY

        self.assertEqual(await self.run_it(days=365), "expired")

    async def test_nothing_is_taken_when_the_plan_is_no_longer_the_one_that_was_paid(self):
        for changed in (dict(plan_code="start"), dict(plan_code="pack"), dict(status="past_due"), dict(status="trialing")):
            with self.subTest(changed=changed):
                self.sub = sub(**changed)
                self.expire.reset_mock()

                self.assertEqual(await self.run_it(), "nothing")
                self.expire.assert_not_awaited()
        self.add_event.assert_not_awaited()

    async def test_a_person_without_a_subscription_has_nothing_to_lose(self):
        self.sub = None

        self.assertEqual(await self.run_it(), "nothing")

    async def test_a_refunded_pack_ends_the_pack(self):
        self.sub = sub(plan_code="pack", current_period_end=NOW + 55 * DAY)

        self.assertEqual(await self.run_it(plan_code="pack", days=60), "expired")

    async def test_refunded_seats_are_taken_back(self):
        self.sub.seats_count = 3
        self.find.return_value = SimpleNamespace(payload={"from": 1, "to": 3})

        result = await self.run_it(seats_added=True, days=15)

        self.assertEqual(result, "seats_reverted")
        self.assertEqual(self.sub.seats_count, 1)
        self.assertEqual(self.find.await_args.kwargs["note"], f"Оплата {self.pid}")
        self.expire.assert_not_awaited()

    async def test_seats_bought_later_stay_when_an_earlier_purchase_is_refunded(self):
        self.sub.seats_count = 5
        self.find.return_value = SimpleNamespace(payload={"from": 1, "to": 3})

        await self.run_it(seats_added=True)

        self.assertEqual(self.sub.seats_count, 3)

    async def test_seats_never_go_below_one(self):
        self.sub.seats_count = 2
        self.find.return_value = SimpleNamespace(payload={"from": 1, "to": 6})

        await self.run_it(seats_added=True)

        self.assertEqual(self.sub.seats_count, 1)

    async def test_seats_of_a_payment_the_journal_does_not_know_are_left(self):
        self.sub.seats_count = 3

        self.assertEqual(await self.run_it(seats_added=True), "nothing")
        self.assertEqual(self.sub.seats_count, 3)

    async def test_seats_already_gone_are_not_taken_twice(self):
        self.sub.seats_count = 1
        self.find.return_value = SimpleNamespace(payload={"from": 1, "to": 3})

        self.assertEqual(await self.run_it(seats_added=True), "nothing")


class AdminAlertTextTests(unittest.IsolatedAsyncioTestCase):
    async def alert(self, effect):
        with patch.object(billing_mail.email_service, "send_notice", AsyncMock(return_value=True)) as send:
            await billing_mail.send_payment_alert_to_admin(
                to="boss@example.com",
                outcome="refunded",
                payment_id="p",
                email="a@example.com",
                amount_kopecks=690_00,
                refunded_kopecks=690_00,
                effect=effect,
            )
        return " ".join(send.await_args.kwargs["paragraphs"])

    async def test_each_effect_is_named(self):
        self.assertIn("переведён на «Старт»", await self.alert("expired"))
        self.assertIn("сокращён", await self.alert("shortened"))
        self.assertIn("Места", await self.alert("seats_reverted"))
        self.assertIn("Токенов+", await self.alert("addon_revoked"))
        self.assertIn("Снимать нечего", await self.alert("nothing"))

    async def test_no_effect_says_the_plan_was_not_touched(self):
        self.assertIn("не менялся", await self.alert(None))


if __name__ == "__main__":
    unittest.main()
