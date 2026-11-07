"""The journal of the plan that the person is shown, and the payment fields that describe what was bought."""

from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.schemas.billing import PaymentInfo
from app.services import billing_service

NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)


def event(kind, payload=None):
    return SimpleNamespace(kind=kind, created_at=NOW, payload=payload)


class HistoryItemTests(unittest.TestCase):
    def test_only_the_fields_meant_for_the_person_are_shown(self):
        item = billing_service.history_item(
            "manual_grant",
            NOW,
            {"plan": "researcher", "until": "2026-12-10", "extended": False, "note": "Оплата 123", "actor": "x"},
        )

        self.assertEqual(item.details, {"plan": "researcher", "until": "2026-12-10", "extended": 0})
        self.assertNotIn("note", item.details)

    def test_kinds_that_are_the_operators_business_are_hidden(self):
        for kind in ("expiring_notified", "limit_warning", "downgrade_closed_surveys", "unknown"):
            with self.subTest(kind=kind):
                self.assertIsNone(billing_service.history_item(kind, NOW, {"a": 1}))

    def test_a_missing_payload_gives_empty_values(self):
        item = billing_service.history_item("seats_added", NOW, None)

        self.assertEqual(item.details, {"from": None, "to": None})

    def test_values_that_are_not_plain_are_dropped(self):
        item = billing_service.history_item("canceled", NOW, {"period_end": {"nested": 1}})

        self.assertEqual(item.details, {})


class HistoryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user = SimpleNamespace(id=uuid.uuid4())
        self.sub = SimpleNamespace(id=uuid.uuid4())
        self.get = patch.object(
            billing_service.billing_repository, "get_subscription", AsyncMock(return_value=self.sub)
        ).start()
        self.events = patch.object(
            billing_service.billing_repository, "list_events", AsyncMock(return_value=[])
        ).start()
        self.addCleanup(patch.stopall)

    async def test_a_person_without_a_subscription_has_no_history(self):
        self.get.return_value = None

        self.assertEqual(await billing_service.get_history(object(), self.user), [])

    async def test_the_journal_is_filtered_and_keeps_its_order(self):
        self.events.return_value = [
            event("limit_warning"),
            event("refund_revoked", {"result": "expired"}),
            event("manual_grant", {"plan": "researcher"}),
        ]

        items = await billing_service.get_history(object(), self.user)

        self.assertEqual([i.kind for i in items], ["refund_revoked", "manual_grant"])


class PaymentInfoTests(unittest.TestCase):
    def test_a_payment_says_what_it_bought(self):
        payment = SimpleNamespace(
            id=uuid.uuid4(),
            plan_code="researcher",
            term="seats_add",
            seats=3,
            days=15,
            amount_kopecks=300_00,
            status="succeeded",
            created_at=NOW,
            paid_at=NOW,
            refunded_kopecks=0,
            is_test=False,
        )

        info = PaymentInfo.model_validate(payment, from_attributes=True)

        self.assertEqual((info.plan_code, info.term, info.seats, info.days), ("researcher", "seats_add", 3, 15))


if __name__ == "__main__":
    unittest.main()
