from __future__ import annotations

import base64
import json
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import HTTPException

from app.api.routes import billing as billing_routes
from app.models.payment import (
    PAYMENT_CANCELED,
    PAYMENT_FAILED,
    PAYMENT_MISMATCH,
    PAYMENT_NEW,
    PAYMENT_PENDING,
    PAYMENT_SUCCEEDED,
    Payment,
)
from app.schemas.billing import CheckoutRequest
from app.services import payment_service, yookassa_client
from app.services.yookassa_client import ProviderPayment

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
FAR = datetime(2099, 1, 1, tzinfo=timezone.utc)
MONTH = 790_00


def provider_payment(**overrides) -> ProviderPayment:
    data = dict(
        id="pay-1",
        status="succeeded",
        paid=True,
        amount_kopecks=MONTH,
        currency="RUB",
        confirmation_url=None,
        refunded_kopecks=0,
        is_test=False,
        cancel_reason=None,
        metadata={},
    )
    data.update(overrides)
    return ProviderPayment(**data)


def our_payment(**overrides) -> Payment:
    data = dict(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        payer_email="anna@example.com",
        provider="yookassa",
        provider_payment_id="pay-1",
        idempotence_key="key-1",
        plan_code="researcher",
        term="month",
        days=30,
        amount_kopecks=MONTH,
        currency="RUB",
        status=PAYMENT_PENDING,
        confirmation_url="https://pay.example/1",
        failure_reason=None,
        is_test=False,
        refunded_kopecks=0,
        created_at=NOW - timedelta(minutes=5),
        paid_at=None,
        applied_at=None,
        refunded_at=None,
    )
    data.update(overrides)
    return Payment(**data)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.flush = AsyncMock()
    return session


def user(**overrides):
    data = dict(id=uuid.uuid4(), email="anna@example.com", first_name="Анна", is_active=True)
    data.update(overrides)
    return SimpleNamespace(**data)


def mock_client(handler):
    """A YooKassa client whose network is the given function."""
    return lambda: httpx.AsyncClient(
        base_url="https://api.test/v3",
        auth=("shop", "secret"),
        transport=httpx.MockTransport(handler),
    )


class AmountTests(unittest.TestCase):
    def test_amounts_are_written_with_two_decimals(self):
        self.assertEqual(yookassa_client.format_amount(790_00), "790.00")
        self.assertEqual(yookassa_client.format_amount(49_05), "49.05")
        self.assertEqual(yookassa_client.format_amount(5), "0.05")

    def test_amounts_are_read_back_exactly(self):
        for kopecks in (0, 5, 49_05, 790_00, 7_900_00):
            self.assertEqual(
                yookassa_client.parse_amount(yookassa_client.format_amount(kopecks)), kopecks
            )

    def test_an_unreadable_amount_is_an_error_not_a_zero(self):
        with self.assertRaises(yookassa_client.ProviderError):
            yookassa_client.parse_amount("много")


class ProviderAddressTests(unittest.TestCase):
    def test_the_published_addresses_are_recognised(self):
        for address in (
            "185.71.76.5",
            "185.71.77.31",
            "77.75.153.100",
            "77.75.156.11",
            "77.75.156.35",
            "77.75.154.200",
            "2a02:5180::1",
        ):
            with self.subTest(address=address):
                self.assertTrue(yookassa_client.is_provider_address(address))

    def test_everything_else_is_not(self):
        for address in ("8.8.8.8", "185.71.76.32", "77.75.156.12", "127.0.0.1", "", "nonsense", "2a02:5181::1"):
            with self.subTest(address=address):
                self.assertFalse(yookassa_client.is_provider_address(address))


class ClientTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.seen: list[httpx.Request] = []
        self.addCleanup(patch.stopall)

    def serve(self, status_code=200, body=None, error=None):
        def handler(request: httpx.Request) -> httpx.Response:
            self.seen.append(request)
            if error:
                raise error
            return httpx.Response(status_code, json=body if body is not None else {})

        patch.object(yookassa_client, "_client", mock_client(handler)).start()

    created = {
        "id": "pay-1",
        "status": "pending",
        "paid": False,
        "amount": {"value": "790.00", "currency": "RUB"},
        "confirmation": {"type": "redirect", "confirmation_url": "https://pay.example/1"},
        "test": True,
        "metadata": {"payment_id": "x"},
    }

    async def test_a_payment_is_created_with_the_key_the_amount_and_the_return_page(self):
        self.serve(200, self.created)

        result = await yookassa_client.create_payment(
            idempotence_key="key-1",
            amount_kopecks=MONTH,
            description="Тариф",
            return_url="https://app/return",
            metadata={"payment_id": "x"},
        )

        request = self.seen[0]
        self.assertEqual((request.method, request.url.path), ("POST", "/v3/payments"))
        self.assertEqual(request.headers["Idempotence-Key"], "key-1")
        self.assertEqual(
            request.headers["Authorization"],
            "Basic " + base64.b64encode(b"shop:secret").decode(),
        )
        body = json.loads(request.content)
        self.assertEqual(body["amount"], {"value": "790.00", "currency": "RUB"})
        self.assertEqual(body["confirmation"], {"type": "redirect", "return_url": "https://app/return"})
        self.assertTrue(body["capture"])
        self.assertEqual(body["metadata"], {"payment_id": "x"})
        self.assertEqual((result.id, result.confirmation_url, result.is_test), ("pay-1", "https://pay.example/1", True))
        self.assertEqual((result.amount_kopecks, result.status), (MONTH, "pending"))

    async def test_the_description_is_cut_to_what_the_provider_accepts(self):
        self.serve(200, self.created)

        await yookassa_client.create_payment(
            idempotence_key="k", amount_kopecks=100, description="я" * 300, return_url="u", metadata={}
        )

        self.assertEqual(len(json.loads(self.seen[0].content)["description"]), 128)

    async def test_a_payment_is_read_with_its_refund_and_cancellation(self):
        self.serve(
            200,
            {
                **self.created,
                "status": "canceled",
                "refunded_amount": {"value": "100.50", "currency": "RUB"},
                "cancellation_details": {"party": "merchant", "reason": "expired_on_confirmation"},
            },
        )

        result = await yookassa_client.get_payment("pay-1")

        self.assertEqual((self.seen[0].method, self.seen[0].url.path), ("GET", "/v3/payments/pay-1"))
        self.assertEqual(result.refunded_kopecks, 100_50)
        self.assertEqual(result.cancel_reason, "expired_on_confirmation")

    async def test_a_busy_or_broken_provider_is_unavailable(self):
        for status_code in (429, 500, 502, 503):
            with self.subTest(status_code=status_code):
                self.serve(status_code, {})
                with self.assertRaises(yookassa_client.ProviderUnavailable):
                    await yookassa_client.get_payment("pay-1")

    async def test_a_network_failure_is_unavailable(self):
        self.serve(error=httpx.ConnectTimeout("slow"))

        with self.assertRaises(yookassa_client.ProviderUnavailable):
            await yookassa_client.get_payment("pay-1")

    async def test_a_refusal_carries_the_providers_own_words(self):
        self.serve(401, {"type": "error", "code": "invalid_credentials", "description": "Неверный ключ"})

        with self.assertRaises(yookassa_client.ProviderRejected) as ctx:
            await yookassa_client.get_payment("pay-1")

        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("Неверный ключ", ctx.exception.detail)

    async def test_an_unexpected_body_is_an_error(self):
        self.serve(200, {"id": "pay-1"})

        with self.assertRaises(yookassa_client.ProviderError):
            await yookassa_client.get_payment("pay-1")


class OfferTests(unittest.TestCase):
    def test_the_price_and_the_days_follow_the_catalogue(self):
        self.assertEqual(payment_service.offer("month"), (79000, 30))
        self.assertEqual(payment_service.offer("year"), (790000, 365))
        self.assertEqual(payment_service.offer("one_off"), (49000, 30))

    def test_an_unknown_term_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            payment_service.offer("week")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_the_return_page_names_the_payment_and_keeps_the_rest_of_the_address(self):
        payment_id = uuid.uuid4()
        with patch.object(payment_service.settings, "YOOKASSA_RETURN_URL", ""), patch.object(
            payment_service.settings, "SURVEYS_APP_PUBLIC_URL", "https://surveys.example/"
        ):
            url = payment_service._return_url(payment_id)
        self.assertEqual(url, f"https://surveys.example/profile?tab=subscription&payment={payment_id}")

        with patch.object(payment_service.settings, "YOOKASSA_RETURN_URL", "https://x.example/back"):
            self.assertEqual(
                payment_service._return_url(payment_id), f"https://x.example/back?payment={payment_id}"
            )


class CheckoutTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = session_mock()
        self.person = user()
        self.added: list[Payment] = []

        async def add(session, payment):
            self.added.append(payment)
            payment.id = payment.id or uuid.uuid4()
            return payment

        patch.object(payment_service.payment_repository, "add", add).start()
        self.find_open = patch.object(
            payment_service.payment_repository, "find_open_checkout", AsyncMock(return_value=None)
        ).start()
        self.create = patch.object(
            payment_service.yookassa_client,
            "create_payment",
            AsyncMock(
                return_value=provider_payment(
                    status="pending", paid=False, confirmation_url="https://pay.example/1", is_test=True
                )
            ),
        ).start()
        patch.object(payment_service.settings, "BILLING_ENABLED", True).start()
        patch.object(payment_service.settings, "YOOKASSA_SHOP_ID", "shop").start()
        patch.object(payment_service.settings, "YOOKASSA_SECRET_KEY", "secret").start()
        self.addCleanup(patch.stopall)

    async def test_a_payment_is_stored_before_the_provider_is_called_and_filled_after(self):
        order: list[str] = []
        self.session.commit.side_effect = lambda: order.append("commit")
        self.create.side_effect = lambda **kw: order.append("provider") or provider_payment(
            status="pending", paid=False, confirmation_url="https://pay.example/1", is_test=True
        )

        payment = await payment_service.create_checkout(self.session, self.person, "month", NOW)

        self.assertEqual(order, ["commit", "provider", "commit"])
        self.assertEqual(
            (payment.status, payment.provider_payment_id, payment.confirmation_url, payment.is_test),
            (PAYMENT_PENDING, "pay-1", "https://pay.example/1", True),
        )
        self.assertEqual(
            (payment.amount_kopecks, payment.days, payment.term, payment.user_id),
            (MONTH, 30, "month", self.person.id),
        )
        kwargs = self.create.await_args.kwargs
        self.assertEqual(kwargs["idempotence_key"], payment.idempotence_key)
        self.assertEqual(kwargs["amount_kopecks"], MONTH)
        self.assertIn(f"payment={payment.id}", kwargs["return_url"])
        self.assertEqual(kwargs["metadata"], {"payment_id": str(payment.id), "user_id": str(self.person.id)})

    async def test_nothing_is_created_while_payments_are_off(self):
        for flag, value in (("BILLING_ENABLED", False), ("YOOKASSA_SHOP_ID", ""), ("YOOKASSA_SECRET_KEY", "")):
            with self.subTest(flag=flag), patch.object(payment_service.settings, flag, value):
                with self.assertRaises(HTTPException) as ctx:
                    await payment_service.create_checkout(self.session, self.person, "month", NOW)
                self.assertEqual(ctx.exception.detail["code"], "payments_disabled")
        self.create.assert_not_awaited()

    async def test_an_unknown_term_creates_nothing(self):
        with self.assertRaises(HTTPException):
            await payment_service.create_checkout(self.session, self.person, "week", NOW)

        self.assertEqual(self.added, [])

    async def test_a_second_click_returns_the_same_payment_page(self):
        waiting = our_payment(user_id=self.person.id)
        self.find_open.return_value = waiting

        payment = await payment_service.create_checkout(self.session, self.person, "month", NOW)

        self.assertIs(payment, waiting)
        self.assertEqual(self.added, [])
        self.create.assert_not_awaited()

    async def test_an_unreachable_provider_leaves_a_failed_row_and_a_503(self):
        self.create.side_effect = yookassa_client.ProviderUnavailable("down")

        with self.assertRaises(HTTPException) as ctx:
            await payment_service.create_checkout(self.session, self.person, "month", NOW)

        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual((self.added[0].status, self.added[0].failure_reason), (PAYMENT_FAILED, "provider_unavailable"))
        self.assertIsNone(self.added[0].provider_payment_id)

    async def test_a_refusal_of_the_provider_is_a_502_that_offers_the_invoice(self):
        self.create.side_effect = yookassa_client.ProviderRejected(401, "bad key")

        with self.assertRaises(HTTPException) as ctx:
            await payment_service.create_checkout(self.session, self.person, "month", NOW)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("заявку", ctx.exception.detail["message"])
        self.assertEqual(self.added[0].failure_reason, "provider_rejected")


class SettleTests(unittest.IsolatedAsyncioTestCase):
    """The row is settled from the provider's data, once, whatever number of times it is asked."""

    def setUp(self):
        self.person = user()
        self.row = our_payment(user_id=self.person.id)
        self.sub = SimpleNamespace(current_period_end=FAR)
        patch.object(
            payment_service.user_repository, "get_by_id", AsyncMock(return_value=self.person)
        ).start()
        self.grant = patch.object(
            payment_service.lifecycle, "grant", AsyncMock(return_value=self.sub)
        ).start()
        self.journal = patch.object(payment_service, "_journal", AsyncMock()).start()
        self.close_request = patch.object(payment_service, "_close_plan_request", AsyncMock()).start()
        patch.object(
            payment_service.payment_repository,
            "get_by_provider_id",
            AsyncMock(side_effect=lambda *a, **k: self.row),
        ).start()
        self.addCleanup(patch.stopall)

    def kinds(self):
        return [call.args[2] for call in self.journal.await_args_list]

    async def test_a_paid_payment_extends_the_plan_for_the_paid_term(self):
        result = await payment_service.settle(MagicMock(), provider_payment(), NOW)

        self.assertEqual(result.outcome, "applied")
        self.assertEqual((self.row.status, self.row.paid_at, self.row.applied_at), (PAYMENT_SUCCEEDED, NOW, NOW))
        args, kwargs = self.grant.await_args
        self.assertEqual(args[1:3], (self.person.id, "researcher"))
        self.assertEqual((kwargs["days"], kwargs["interval"]), (30, "month"))
        self.assertIn(str(self.row.id), kwargs["note"])
        self.assertIsNone(kwargs.get("actor_user_id"))
        self.assertEqual(self.kinds(), ["payment_succeeded"])
        self.close_request.assert_awaited_once()
        self.assertIs(result.subscription, self.sub)

    async def test_the_year_is_paid_for_a_year(self):
        self.row.term, self.row.days, self.row.amount_kopecks = "year", 365, 7900_00

        await payment_service.settle(MagicMock(), provider_payment(amount_kopecks=7900_00), NOW)

        self.assertEqual((self.grant.await_args.kwargs["days"], self.grant.await_args.kwargs["interval"]), (365, "year"))

    async def test_the_same_news_a_second_time_grants_nothing_again(self):
        await payment_service.settle(MagicMock(), provider_payment(), NOW)
        self.grant.reset_mock()

        again = await payment_service.settle(MagicMock(), provider_payment(), NOW + timedelta(minutes=1))

        self.assertEqual(again.outcome, "unchanged")
        self.grant.assert_not_awaited()
        self.assertEqual(self.row.paid_at, NOW)

    async def test_a_test_payment_is_marked_as_such(self):
        await payment_service.settle(MagicMock(), provider_payment(is_test=True), NOW)

        self.assertTrue(self.row.is_test)

    async def test_a_payment_still_waiting_changes_nothing(self):
        result = await payment_service.settle(MagicMock(), provider_payment(status="pending", paid=False), NOW)

        self.assertEqual(result.outcome, "unchanged")
        self.assertEqual(self.row.status, PAYMENT_PENDING)
        self.grant.assert_not_awaited()

    async def test_a_succeeded_status_without_the_paid_flag_is_not_money(self):
        result = await payment_service.settle(MagicMock(), provider_payment(paid=False), NOW)

        self.assertEqual(result.outcome, "unchanged")
        self.grant.assert_not_awaited()

    async def test_a_different_amount_grants_nothing_and_asks_for_a_human(self):
        result = await payment_service.settle(MagicMock(), provider_payment(amount_kopecks=100), NOW)

        self.assertEqual(result.outcome, "mismatch")
        self.assertEqual((self.row.status, self.row.failure_reason), (PAYMENT_MISMATCH, "amount_mismatch"))
        self.grant.assert_not_awaited()
        self.assertEqual(self.kinds(), ["payment_mismatch"])

    async def test_a_different_currency_is_a_mismatch_too(self):
        result = await payment_service.settle(MagicMock(), provider_payment(currency="USD"), NOW)

        self.assertEqual(result.outcome, "mismatch")
        self.grant.assert_not_awaited()

    async def test_a_mismatch_is_reported_once(self):
        await payment_service.settle(MagicMock(), provider_payment(amount_kopecks=100), NOW)
        again = await payment_service.settle(MagicMock(), provider_payment(amount_kopecks=100), NOW)

        self.assertEqual(again.outcome, "unchanged")
        self.assertEqual(self.kinds(), ["payment_mismatch"])

    async def test_a_canceled_payment_is_closed_with_the_reason(self):
        result = await payment_service.settle(
            MagicMock(), provider_payment(status="canceled", paid=False, cancel_reason="card_expired"), NOW
        )

        self.assertEqual(result.outcome, "canceled")
        self.assertEqual((self.row.status, self.row.failure_reason), (PAYMENT_CANCELED, "card_expired"))
        self.grant.assert_not_awaited()
        self.assertEqual(self.kinds(), ["payment_canceled"])

    async def test_a_late_cancellation_cannot_undo_a_payment_that_was_paid(self):
        await payment_service.settle(MagicMock(), provider_payment(), NOW)

        result = await payment_service.settle(
            MagicMock(), provider_payment(status="canceled", paid=False), NOW
        )

        self.assertEqual(result.outcome, "unchanged")
        self.assertEqual(self.row.status, PAYMENT_SUCCEEDED)

    async def test_a_refund_is_recorded_once_and_the_plan_is_left_for_a_human(self):
        await payment_service.settle(MagicMock(), provider_payment(), NOW)
        self.grant.reset_mock()

        first = await payment_service.settle(MagicMock(), provider_payment(refunded_kopecks=MONTH), NOW)
        second = await payment_service.settle(MagicMock(), provider_payment(refunded_kopecks=MONTH), NOW)

        self.assertEqual((first.outcome, second.outcome), ("refunded", "unchanged"))
        self.assertEqual(self.row.refunded_kopecks, MONTH)
        self.assertEqual(self.kinds(), ["payment_succeeded", "payment_refunded"])
        self.grant.assert_not_awaited()

    async def test_a_payment_of_a_deleted_account_extends_nothing(self):
        payment_service.user_repository.get_by_id.return_value = None

        result = await payment_service.settle(MagicMock(), provider_payment(), NOW)

        self.assertEqual(result.outcome, "unchanged")
        self.assertEqual((self.row.status, self.row.failure_reason), (PAYMENT_SUCCEEDED, "no_account"))
        self.grant.assert_not_awaited()
        self.assertIsNone(self.row.applied_at)

    async def test_a_payment_that_is_not_ours_is_ignored(self):
        self.row = None

        self.assertIsNone(await payment_service.settle(MagicMock(), provider_payment(), NOW))
        self.grant.assert_not_awaited()


class NotificationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.get = patch.object(
            payment_service.yookassa_client, "get_payment", AsyncMock(return_value=provider_payment())
        ).start()
        self.settle = patch.object(payment_service, "settle", AsyncMock(return_value="settled")).start()
        self.addCleanup(patch.stopall)

    async def handle(self, body):
        return await payment_service.handle_notification(MagicMock(), body, NOW)

    async def test_a_payment_notification_makes_us_read_the_payment_from_the_api(self):
        result = await self.handle(
            {"type": "notification", "event": "payment.succeeded", "object": {"id": "pay-1", "status": "succeeded"}}
        )

        self.assertEqual(result, "settled")
        self.get.assert_awaited_once_with("pay-1")
        # what is settled is the API's answer, not the body of the notification
        self.assertIs(self.settle.await_args.args[1], self.get.return_value)

    async def test_a_refund_notification_names_the_payment_it_belongs_to(self):
        await self.handle(
            {"type": "notification", "event": "refund.succeeded", "object": {"id": "refund-9", "payment_id": "pay-1"}}
        )

        self.get.assert_awaited_once_with("pay-1")

    async def test_other_news_is_ignored_without_asking_the_api(self):
        for body in (
            {},
            {"type": "other"},
            {"type": "notification", "event": "payment.waiting_for_capture", "object": {"id": "p"}},
            {"type": "notification", "event": "payment.succeeded"},
            {"type": "notification", "event": "payment.succeeded", "object": {"id": ""}},
            {"type": "notification", "event": "payment.succeeded", "object": {"id": 5}},
            {"type": "notification", "event": "refund.succeeded", "object": {"id": "r"}},
        ):
            with self.subTest(body=body):
                self.assertIsNone(await self.handle(body))
        self.get.assert_not_awaited()

    async def test_an_api_that_cannot_be_asked_is_passed_up_so_the_notification_is_repeated(self):
        self.get.side_effect = yookassa_client.ProviderUnavailable("down")

        with self.assertRaises(yookassa_client.ProviderUnavailable):
            await self.handle(
                {"type": "notification", "event": "payment.succeeded", "object": {"id": "pay-1"}}
            )


class RefreshTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.person = user()
        self.row = our_payment(user_id=self.person.id)
        self.get_for_user = patch.object(
            payment_service.payment_repository, "get_for_user", AsyncMock(return_value=self.row)
        ).start()
        self.get = patch.object(
            payment_service.yookassa_client, "get_payment", AsyncMock(return_value=provider_payment())
        ).start()
        self.settle = patch.object(
            payment_service,
            "settle",
            AsyncMock(return_value=payment_service.Settlement("applied", self.row)),
        ).start()
        self.addCleanup(patch.stopall)

    async def test_a_person_coming_back_gets_the_provider_asked_at_once(self):
        payment, settlement = await payment_service.refresh_for_user(MagicMock(), self.person, self.row.id, NOW)

        self.assertIs(payment, self.row)
        self.assertEqual(settlement.outcome, "applied")
        self.get.assert_awaited_once_with("pay-1")

    async def test_somebody_elses_payment_is_not_found(self):
        self.get_for_user.return_value = None

        self.assertEqual(
            await payment_service.refresh_for_user(MagicMock(), self.person, uuid.uuid4(), NOW), (None, None)
        )
        self.get.assert_not_awaited()

    async def test_a_payment_that_is_over_is_not_asked_about_again(self):
        self.row.status = PAYMENT_SUCCEEDED

        payment, settlement = await payment_service.refresh_for_user(MagicMock(), self.person, self.row.id, NOW)

        self.assertIs(payment, self.row)
        self.assertIsNone(settlement)
        self.get.assert_not_awaited()

    async def test_a_provider_that_cannot_be_reached_leaves_the_state_as_it_is(self):
        self.get.side_effect = yookassa_client.ProviderUnavailable("down")

        payment, settlement = await payment_service.refresh_for_user(MagicMock(), self.person, self.row.id, NOW)

        self.assertIs(payment, self.row)
        self.assertIsNone(settlement)
        self.settle.assert_not_awaited()


class AnnounceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.granted = patch.object(
            payment_service.billing_mail, "send_plan_granted", AsyncMock(return_value=True)
        ).start()
        self.alert = patch.object(
            payment_service.billing_mail, "send_payment_alert_to_admin", AsyncMock(return_value=True)
        ).start()
        self.addCleanup(patch.stopall)

    async def test_the_person_is_told_when_the_plan_is_on(self):
        settlement = payment_service.Settlement(
            "applied", our_payment(), user(), SimpleNamespace(current_period_end=FAR)
        )

        await payment_service.announce(settlement)

        self.granted.assert_awaited_once()
        self.assertEqual(self.granted.await_args.args[1:], ("Исследователь", FAR))

    async def test_nothing_is_sent_for_a_payment_that_changed_nothing(self):
        await payment_service.announce(payment_service.Settlement("unchanged", our_payment(), user()))
        await payment_service.announce(None)

        self.granted.assert_not_awaited()
        self.alert.assert_not_awaited()

    async def test_the_administrator_hears_of_refunds_and_mismatches_when_an_address_is_set(self):
        for outcome in ("refunded", "mismatch"):
            with self.subTest(outcome=outcome):
                self.alert.reset_mock()
                with patch.object(payment_service.settings, "ADMIN_NOTIFY_EMAIL", "boss@example.com"):
                    await payment_service.announce(payment_service.Settlement(outcome, our_payment(), user()))
                self.assertEqual(self.alert.await_args.kwargs["to"], "boss@example.com")
                self.assertEqual(self.alert.await_args.kwargs["outcome"], outcome)

    async def test_without_an_address_the_administrator_is_not_mailed(self):
        with patch.object(payment_service.settings, "ADMIN_NOTIFY_EMAIL", ""):
            await payment_service.announce(payment_service.Settlement("refunded", our_payment(), user()))

        self.alert.assert_not_awaited()

    async def test_a_failing_mail_server_breaks_nothing(self):
        self.granted.side_effect = RuntimeError("smtp down")
        settlement = payment_service.Settlement(
            "applied", our_payment(), user(), SimpleNamespace(current_period_end=FAR)
        )

        await payment_service.announce(settlement)


class ReconcileTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = session_mock()
        self.row = our_payment()
        self.ids = patch.object(
            payment_service.payment_repository, "list_open_ids", AsyncMock(return_value=[self.row.id])
        ).start()
        self.get_by_id = patch.object(
            payment_service.payment_repository, "get_by_id", AsyncMock(side_effect=lambda *a, **k: self.row)
        ).start()
        self.get = patch.object(
            payment_service.yookassa_client, "get_payment", AsyncMock(return_value=provider_payment())
        ).start()
        self.settle = patch.object(
            payment_service,
            "settle",
            AsyncMock(side_effect=lambda *a, **k: payment_service.Settlement("applied", self.row, user())),
        ).start()
        self.announce = patch.object(payment_service, "announce", AsyncMock()).start()
        patch.object(payment_service.settings, "YOOKASSA_SHOP_ID", "shop").start()
        self.addCleanup(patch.stopall)

    async def test_a_payment_no_notification_settled_is_settled_by_the_worker(self):
        done = await payment_service.reconcile_open(self.session, NOW)

        self.assertEqual(done["applied"], 1)
        self.get.assert_awaited_once_with("pay-1")
        self.announce.assert_awaited_once()

    async def test_without_credentials_the_worker_does_not_call_anyone(self):
        with patch.object(payment_service.settings, "YOOKASSA_SHOP_ID", ""):
            done = await payment_service.reconcile_open(self.session, NOW)

        self.assertEqual(done, {})
        self.ids.assert_not_awaited()

    async def test_a_provider_that_is_down_stops_the_round_without_harm(self):
        self.get.side_effect = yookassa_client.ProviderUnavailable("down")

        done = await payment_service.reconcile_open(self.session, NOW)

        self.assertEqual(done, {})
        self.announce.assert_not_awaited()

    async def test_one_broken_payment_does_not_stop_the_others(self):
        other = our_payment(provider_payment_id="pay-2")
        self.ids.return_value = [self.row.id, other.id]
        rows = {self.row.id: self.row, other.id: other}
        self.get_by_id.side_effect = lambda s, payment_id, **k: rows[payment_id]
        calls = []

        async def settle(session, provider, now=None):
            calls.append(provider.id)
            if len(calls) == 1:
                raise RuntimeError("boom")
            return payment_service.Settlement("applied", other, user())

        self.get.side_effect = lambda pid: provider_payment(id=pid)
        patch.object(payment_service, "settle", settle).start()

        done = await payment_service.reconcile_open(self.session, NOW)

        self.assertEqual(calls, ["pay-1", "pay-2"])
        self.assertEqual(done["applied"], 1)

    async def test_a_payment_the_provider_never_heard_of_is_written_off_after_a_while(self):
        self.row.provider_payment_id = None
        self.row.status = PAYMENT_NEW
        self.row.created_at = NOW - timedelta(minutes=30)

        done = await payment_service.reconcile_open(self.session, NOW)

        self.assertEqual((self.row.status, self.row.failure_reason), (PAYMENT_FAILED, "no_provider_answer"))
        self.assertEqual(done["written_off"], 1)
        self.get.assert_not_awaited()

    async def test_a_fresh_payment_without_the_providers_id_is_left_alone(self):
        self.row.provider_payment_id = None
        self.row.status = PAYMENT_NEW
        self.row.created_at = NOW - timedelta(minutes=3)

        done = await payment_service.reconcile_open(self.session, NOW)

        self.assertEqual(self.row.status, PAYMENT_NEW)
        self.assertEqual(done, {})


def request(peer="185.71.76.5", headers=None, body=None, raises=None):
    result = SimpleNamespace(client=SimpleNamespace(host=peer), headers=headers or {})
    result.json = AsyncMock(return_value=body, side_effect=raises)
    return result


class RouteTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = session_mock()
        self.tasks = MagicMock()
        self.handle = patch.object(
            billing_routes.payment_service, "handle_notification", AsyncMock(return_value="settlement")
        ).start()
        patch.object(billing_routes.settings, "BILLING_ENABLED", True).start()
        patch.object(billing_routes.settings, "YOOKASSA_SHOP_ID", "shop").start()
        patch.object(billing_routes.settings, "YOOKASSA_VERIFY_WEBHOOK_IP", True).start()
        self.addCleanup(patch.stopall)

    async def webhook(self, req):
        return await billing_routes.yookassa_webhook(req, self.session, self.tasks)

    async def test_a_notification_from_yookassa_is_settled_committed_and_announced_afterwards(self):
        result = await self.webhook(request(body={"type": "notification"}))

        self.assertEqual(result, {"ok": True})
        self.handle.assert_awaited_once()
        self.session.commit.assert_awaited_once()
        self.tasks.add_task.assert_called_once_with(billing_routes.payment_service.announce, "settlement")

    async def test_a_stranger_is_turned_away_before_anything_is_read(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.webhook(request(peer="8.8.8.8", body={"type": "notification"}))

        self.assertEqual(ctx.exception.status_code, 403)
        self.handle.assert_not_awaited()

    async def test_a_stranger_cannot_borrow_an_address_with_a_header(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.webhook(request(peer="8.8.8.8", headers={"x-real-ip": "185.71.76.5"}, body={}))

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_behind_our_proxy_the_address_comes_from_the_proxy_header(self):
        for peer in ("172.18.0.5", "10.0.0.2", "127.0.0.1"):
            with self.subTest(peer=peer):
                result = await self.webhook(
                    request(peer=peer, headers={"x-real-ip": "185.71.77.4"}, body={"type": "notification"})
                )
                self.assertEqual(result, {"ok": True})

    async def test_the_address_check_can_be_switched_off(self):
        with patch.object(billing_routes.settings, "YOOKASSA_VERIFY_WEBHOOK_IP", False):
            result = await self.webhook(request(peer="8.8.8.8", body={"type": "notification"}))

        self.assertEqual(result, {"ok": True})

    async def test_without_a_shop_the_endpoint_does_not_exist(self):
        with patch.object(billing_routes.settings, "YOOKASSA_SHOP_ID", ""):
            with self.assertRaises(HTTPException) as ctx:
                await self.webhook(request(body={}))

        self.assertEqual(ctx.exception.status_code, 404)

    async def test_a_body_that_is_not_json_is_a_400(self):
        for req in (request(raises=ValueError("bad")), request(body=[1, 2])):
            with self.assertRaises(HTTPException) as ctx:
                await self.webhook(req)
            self.assertEqual(ctx.exception.status_code, 400)

    async def test_an_api_that_cannot_be_asked_makes_yookassa_repeat_the_notification(self):
        self.handle.side_effect = yookassa_client.ProviderUnavailable("down")

        with self.assertRaises(HTTPException) as ctx:
            await self.webhook(request(body={"type": "notification"}))

        self.assertEqual(ctx.exception.status_code, 503)
        self.session.commit.assert_not_awaited()

    async def test_a_refusal_of_the_api_is_answered_with_200_because_repeating_cannot_help(self):
        self.handle.side_effect = yookassa_client.ProviderRejected(404, "not found")

        result = await self.webhook(request(body={"type": "notification"}))

        self.assertEqual(result, {"ok": True})
        self.session.commit.assert_not_awaited()

    async def test_checkout_returns_the_page_to_send_the_person_to(self):
        person = user()
        row = our_payment(user_id=person.id)
        with patch.object(
            billing_routes.payment_service, "create_checkout", AsyncMock(return_value=row)
        ) as create:
            result = await billing_routes.create_checkout(CheckoutRequest(term="year"), self.session, person)

        create.assert_awaited_once_with(self.session, person, "year")
        self.assertEqual((result.payment_id, result.confirmation_url), (row.id, "https://pay.example/1"))

    async def test_checkout_without_a_page_from_the_provider_is_a_502(self):
        row = our_payment(confirmation_url=None)
        with patch.object(billing_routes.payment_service, "create_checkout", AsyncMock(return_value=row)):
            with self.assertRaises(HTTPException) as ctx:
                await billing_routes.create_checkout(CheckoutRequest(), self.session, user())

        self.assertEqual(ctx.exception.status_code, 502)

    async def test_checkout_is_closed_while_plans_are_off(self):
        with patch.object(billing_routes.settings, "BILLING_ENABLED", False):
            with self.assertRaises(HTTPException) as ctx:
                await billing_routes.create_checkout(CheckoutRequest(), self.session, user())

        self.assertEqual(ctx.exception.status_code, 409)

    async def test_the_state_of_a_payment_is_refreshed_committed_and_announced(self):
        person, row = user(), our_payment()
        refreshed = (row, "settlement")
        with patch.object(
            billing_routes.payment_service, "refresh_for_user", AsyncMock(return_value=refreshed)
        ):
            result = await billing_routes.get_payment(row.id, self.session, person, self.tasks)

        self.assertIs(result, row)
        self.session.commit.assert_awaited_once()
        self.tasks.add_task.assert_called_once_with(billing_routes.payment_service.announce, "settlement")

    async def test_somebody_elses_payment_is_a_404(self):
        with patch.object(
            billing_routes.payment_service, "refresh_for_user", AsyncMock(return_value=(None, None))
        ):
            with self.assertRaises(HTTPException) as ctx:
                await billing_routes.get_payment(uuid.uuid4(), self.session, user(), self.tasks)

        self.assertEqual(ctx.exception.status_code, 404)

    async def test_the_history_is_the_persons_own(self):
        person = user()
        with patch.object(
            billing_routes.payment_repository, "list_for_user", AsyncMock(return_value=["row"])
        ) as listing:
            result = await billing_routes.list_payments(self.session, person)

        self.assertEqual(result, ["row"])
        listing.assert_awaited_once_with(
            self.session,
            person.id,
            limit=billing_routes.PAYMENT_HISTORY_LIMIT,
            exclude_statuses=(PAYMENT_NEW, PAYMENT_FAILED),
        )


class SettingsTests(unittest.TestCase):
    def test_online_payment_needs_plans_and_both_credentials(self):
        from app.core.config import Settings

        base = dict(OPENROUTER_API_KEY="x", BILLING_ENABLED=True, YOOKASSA_SHOP_ID="1", YOOKASSA_SECRET_KEY="k")
        self.assertTrue(Settings(**base).payments_enabled)
        for override in ({"BILLING_ENABLED": False}, {"YOOKASSA_SHOP_ID": " "}, {"YOOKASSA_SECRET_KEY": ""}):
            with self.subTest(override=override):
                self.assertFalse(Settings(**{**base, **override}).payments_enabled)


if __name__ == "__main__":
    unittest.main()
