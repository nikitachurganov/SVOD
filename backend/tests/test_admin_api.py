from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.api import deps
from app.api.routes import admin as admin_routes
from app.api.routes import billing as billing_routes
from app.constants.roles import ROLE_ADMIN, ROLE_USER
from app.models.plan_request import (
    PLAN_REQUEST_APPROVED,
    PLAN_REQUEST_PENDING,
    PLAN_REQUEST_REJECTED,
)
from app.models.subscription import Subscription
from app.schemas.admin import (
    AdminApproveRequest,
    AdminGrantRequest,
    AdminRejectRequest,
    AdminUserPatch,
)
from app.schemas.auth import LoginRequest
from app.schemas.billing import PlanRequestCreate
from app.services import admin_service, auth_service, plan_request_service

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
DAY = timedelta(days=1)


def person(**overrides):
    data = dict(
        id=uuid.uuid4(),
        first_name="Анна",
        last_name="Иванова",
        middle_name=None,
        email="anna@example.com",
        phone_number="+79990000000",
        password_hash="secret-hash",
        email_verified_at=NOW - 10 * DAY,
        created_at=NOW - 30 * DAY,
        last_login_at=None,
        is_active=True,
        ai_enabled=True,
        role=ROLE_USER,
        deletion_requested_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def paid_subscription(**overrides):
    data = dict(
        id=uuid.uuid4(),
        plan_code="researcher",
        status="active",
        billing_interval="one_off",
        current_period_start=NOW - 5 * DAY,
        current_period_end=NOW + 25 * DAY,
        trial_ends_at=None,
        trial_used_at=None,
        cancel_at_period_end=False,
        limit_overrides=None,
    )
    data.update(overrides)
    return Subscription(**data)


def session_mock():
    session = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    return session


class EveryAdminRouteIsClosedTests(unittest.TestCase):
    def test_the_router_demands_the_administrator_role_for_all_its_routes(self):
        demanded = [dependency.dependency for dependency in admin_routes.router.dependencies]

        self.assertIn(deps.get_admin_user, demanded)
        self.assertGreaterEqual(len(admin_routes.router.routes), 8)

    def test_the_router_is_mounted_under_admin(self):
        from app.api.routes import api_router

        paths = {route.path for route in api_router.routes}

        self.assertIn("/admin/users", paths)
        self.assertIn("/admin/stats", paths)
        self.assertIn("/admin/plan-requests/{request_id}/approve", paths)


class UserTableTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = session_mock()
        self.free = person(email="free@example.com")
        self.payer = person(email="payer@example.com", last_login_at=NOW - DAY)
        self.sub = paid_subscription(
            user_id=self.payer.id, limit_overrides={"ai_actions_per_period": 500}
        )
        self.list = patch.object(
            admin_service.admin_repository,
            "list_users",
            AsyncMock(return_value=([(self.free, None), (self.payer, self.sub)], 41)),
        ).start()
        patch.object(
            admin_service.admin_repository,
            "usage_by_user",
            AsyncMock(return_value={self.payer.id: 7}),
        ).start()
        patch.object(
            admin_service.admin_repository,
            "survey_counts_by_owner",
            AsyncMock(return_value={self.payer.id: 3}),
        ).start()
        patch.object(
            admin_service.admin_repository,
            "response_counts_by_owner",
            AsyncMock(return_value={self.payer.id: 120}),
        ).start()
        patch.object(admin_service, "_now", return_value=NOW).start()
        self.addCleanup(patch.stopall)

    async def table(self, **overrides):
        args = dict(
            query=None,
            tier=None,
            email_verified=None,
            is_active=None,
            role=None,
            deletion_requested=None,
            sort="created_at",
            descending=True,
            page=1,
            page_size=25,
        )
        args.update(overrides)
        return await admin_service.list_users(self.session, **args)

    async def test_a_person_without_a_subscription_is_shown_on_the_free_plan(self):
        result = await self.table()

        row = result.items[0]
        self.assertEqual((row.plan_code, row.ai_actions_used, row.surveys_count), ("start", 0, 0))
        self.assertIsNone(row.plan_ends_at)
        self.assertTrue(row.email_verified)

    async def test_a_paid_person_shows_the_plan_end_the_personal_limit_and_the_counters(self):
        row = (await self.table()).items[1]

        self.assertEqual((row.plan_code, row.subscription_status), ("researcher", "active"))
        self.assertEqual(row.plan_ends_at, self.sub.current_period_end)
        self.assertEqual((row.ai_actions_used, row.ai_actions_max), (7, 500))
        self.assertEqual((row.surveys_count, row.responses_count), (3, 120))

    async def test_the_page_carries_the_total_and_the_offset(self):
        result = await self.table(page=3, page_size=10)

        self.assertEqual((result.total, result.page, result.page_size), (41, 3, 10))
        kwargs = self.list.await_args.kwargs
        self.assertEqual((kwargs["offset"], kwargs["limit"]), (20, 10))

    async def test_the_page_size_is_capped(self):
        await self.table(page_size=10_000)

        self.assertEqual(self.list.await_args.kwargs["limit"], admin_service.MAX_PAGE_SIZE)

    async def test_the_table_never_exposes_the_password_hash(self):
        dumped = (await self.table()).model_dump_json()

        self.assertNotIn("password", dumped)
        self.assertNotIn("secret-hash", dumped)


class BlockingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = session_mock()
        self.admin = person(role=ROLE_ADMIN, email="boss@example.com")
        self.target = person()
        patch.object(
            admin_service.admin_repository, "get_user", AsyncMock(return_value=self.target)
        ).start()
        self.other_admins = patch.object(
            admin_service.admin_repository, "count_other_active_admins", AsyncMock(return_value=1)
        ).start()
        patch.object(
            admin_service.billing_service,
            "ensure_subscription",
            AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4())),
        ).start()
        self.add_event = patch.object(
            admin_service.billing_repository, "add_event", AsyncMock()
        ).start()
        self.addCleanup(patch.stopall)

    def kinds(self):
        return [call.kwargs["kind"] for call in self.add_event.await_args_list]

    async def test_a_person_can_be_blocked_and_it_is_journaled_with_the_actor(self):
        await admin_service.update_user(
            self.session, self.admin, self.target.id, AdminUserPatch(is_active=False)
        )

        self.assertFalse(self.target.is_active)
        self.assertEqual(self.kinds(), ["account_blocked"])
        self.assertEqual(self.add_event.await_args.kwargs["actor_user_id"], self.admin.id)

    async def test_a_blocked_person_can_be_unblocked(self):
        self.target.is_active = False

        await admin_service.update_user(
            self.session, self.admin, self.target.id, AdminUserPatch(is_active=True)
        )

        self.assertTrue(self.target.is_active)
        self.assertEqual(self.kinds(), ["account_unblocked"])

    async def test_an_administrator_cannot_block_themselves(self):
        patch.object(
            admin_service.admin_repository, "get_user", AsyncMock(return_value=self.admin)
        ).start()

        with self.assertRaises(HTTPException) as ctx:
            await admin_service.update_user(
                self.session, self.admin, self.admin.id, AdminUserPatch(is_active=False)
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "cannot_block_self")
        self.assertTrue(self.admin.is_active)

    async def test_the_last_administrator_cannot_be_blocked(self):
        last = person(role=ROLE_ADMIN)
        patch.object(
            admin_service.admin_repository, "get_user", AsyncMock(return_value=last)
        ).start()
        self.other_admins.return_value = 0

        with self.assertRaises(HTTPException) as ctx:
            await admin_service.update_user(
                self.session, self.admin, last.id, AdminUserPatch(is_active=False)
            )

        self.assertEqual(ctx.exception.detail["code"], "last_admin")
        self.assertTrue(last.is_active)

    async def test_another_administrator_can_be_blocked_while_one_remains(self):
        other = person(role=ROLE_ADMIN)
        patch.object(
            admin_service.admin_repository, "get_user", AsyncMock(return_value=other)
        ).start()

        await admin_service.update_user(
            self.session, self.admin, other.id, AdminUserPatch(is_active=False)
        )

        self.assertFalse(other.is_active)

    async def test_ai_is_switched_off_and_on_with_a_journal_entry(self):
        await admin_service.update_user(
            self.session, self.admin, self.target.id, AdminUserPatch(ai_enabled=False)
        )
        await admin_service.update_user(
            self.session, self.admin, self.target.id, AdminUserPatch(ai_enabled=True)
        )

        self.assertEqual(self.kinds(), ["ai_disabled", "ai_enabled"])

    async def test_nothing_is_journaled_when_nothing_changes(self):
        await admin_service.update_user(
            self.session,
            self.admin,
            self.target.id,
            AdminUserPatch(is_active=True, ai_enabled=True),
        )

        self.add_event.assert_not_awaited()

    async def test_an_unknown_person_is_404(self):
        patch.object(
            admin_service.admin_repository, "get_user", AsyncMock(return_value=None)
        ).start()

        with self.assertRaises(HTTPException) as ctx:
            await admin_service.update_user(
                self.session, self.admin, uuid.uuid4(), AdminUserPatch(is_active=False)
            )

        self.assertEqual(ctx.exception.status_code, 404)


class GrantAndRevokeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = session_mock()
        self.admin = person(role=ROLE_ADMIN)
        self.target = person()
        patch.object(
            admin_service.admin_repository, "get_user", AsyncMock(return_value=self.target)
        ).start()
        self.grant = patch.object(admin_service.lifecycle, "grant", AsyncMock()).start()
        self.expire = patch.object(
            admin_service.lifecycle, "expire_subscription", AsyncMock(return_value=2)
        ).start()
        self.get_sub = patch.object(
            admin_service.billing_repository, "get_subscription", AsyncMock()
        ).start()
        self.add_event = patch.object(
            admin_service.billing_repository, "add_event", AsyncMock()
        ).start()
        patch.object(admin_service, "_now", return_value=NOW).start()
        self.addCleanup(patch.stopall)

    async def test_the_grant_goes_through_the_same_function_as_the_command_line(self):
        payload = AdminGrantRequest(
            days=30, note="  подарок  ", limit_overrides={"ai_actions_per_period": 500}
        )

        await admin_service.grant_plan(self.session, self.admin, self.target.id, payload)

        args, kwargs = self.grant.await_args
        self.assertEqual(args[1:3], (self.target.id, "researcher"))
        self.assertEqual(kwargs["days"], 30)
        self.assertEqual(kwargs["actor_user_id"], self.admin.id)
        self.assertEqual(kwargs["note"], "подарок")
        self.assertEqual(kwargs["limit_overrides"], {"ai_actions_per_period": 500})

    async def test_a_date_without_a_zone_is_taken_as_utc(self):
        payload = AdminGrantRequest(until=datetime(2027, 1, 1))

        await admin_service.grant_plan(self.session, self.admin, self.target.id, payload)

        self.assertEqual(
            self.grant.await_args.kwargs["until"], datetime(2027, 1, 1, tzinfo=timezone.utc)
        )

    async def test_unknown_and_negative_limits_are_refused_before_anything_is_granted(self):
        for overrides in ({"free_pizza": 1}, {"max_projects": -1}):
            with self.subTest(overrides=overrides):
                with self.assertRaises(HTTPException) as ctx:
                    await admin_service.grant_plan(
                        self.session,
                        self.admin,
                        self.target.id,
                        AdminGrantRequest(days=5, limit_overrides=overrides),
                    )
                self.assertEqual(ctx.exception.status_code, 422)
        self.grant.assert_not_awaited()

    async def test_a_refusal_of_the_lifecycle_becomes_422(self):
        self.grant.side_effect = ValueError("Выдать можно только платный тариф")

        with self.assertRaises(HTTPException) as ctx:
            await admin_service.grant_plan(
                self.session, self.admin, self.target.id, AdminGrantRequest(plan="start", days=5)
            )

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail["code"], "grant_failed")

    async def test_revoke_returns_the_person_to_the_free_plan_from_now(self):
        sub = paid_subscription()
        self.get_sub.return_value = sub

        await admin_service.revoke_plan(self.session, self.admin, self.target.id)

        # The free window must start now, not at the end of the paid period that was cut short
        self.assertEqual(sub.current_period_end, NOW)
        self.assertEqual(self.expire.await_args.args[2:], (NOW, "admin_revoked"))
        event = self.add_event.await_args.kwargs
        self.assertEqual(event["kind"], "admin_revoked")
        self.assertEqual(event["actor_user_id"], self.admin.id)
        self.assertEqual(event["payload"], {"from_plan": "researcher", "closed_surveys": 2})

    async def test_there_is_nothing_to_revoke_on_the_free_plan(self):
        for found in (None, paid_subscription(plan_code="start")):
            with self.subTest(found=found):
                self.get_sub.return_value = found
                with self.assertRaises(HTTPException) as ctx:
                    await admin_service.revoke_plan(self.session, self.admin, self.target.id)
                self.assertEqual(ctx.exception.detail["code"], "nothing_to_revoke")
        self.expire.assert_not_awaited()

    async def test_a_plan_is_not_revoked_while_the_account_waits_for_deletion(self):
        self.get_sub.return_value = paid_subscription()
        self.target.deletion_requested_at = NOW

        with self.assertRaises(HTTPException) as ctx:
            await admin_service.revoke_plan(self.session, self.admin, self.target.id)

        self.assertEqual(ctx.exception.detail["code"], "deletion_scheduled")
        self.expire.assert_not_awaited()


class StatsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        repo = admin_service.admin_repository
        patch.object(
            repo,
            "user_totals",
            AsyncMock(
                return_value=dict(
                    total=10, new_7d=2, new_30d=5, active_30d=6, email_verified=8, blocked=1
                )
            ),
        ).start()
        patch.object(
            repo,
            "tier_totals",
            AsyncMock(return_value={"free": 6, "trial": 1, "paid": 3, "past_due": 0}),
        ).start()
        self.paying = patch.object(
            repo,
            "paid_by_interval",
            AsyncMock(return_value=[("researcher", "month", 2), ("researcher", "year", 1)]),
        ).start()
        self.cost = patch.object(
            admin_service.billing_repository, "sum_ai_cost_usd", AsyncMock(return_value=1)
        ).start()
        patch.object(
            admin_service.plan_request_repository, "count_pending", AsyncMock(return_value=4)
        ).start()
        patch.object(
            admin_service.payment_repository, "sum_received", AsyncMock(return_value=123_00)
        ).start()
        patch.object(admin_service.settings, "AI_COST_RUB_PER_USD", 90).start()
        self.addCleanup(patch.stopall)

    async def test_the_summary_counts_people_plans_requests_and_money(self):
        stats = await admin_service.get_stats(MagicMock())

        self.assertEqual((stats.users.total, stats.users.new_7d), (10, 2))
        self.assertEqual((stats.plans.paid, stats.plans.trial, stats.plans.free), (3, 1, 6))
        self.assertEqual(stats.pending_plan_requests, 4)
        self.assertEqual(stats.received_30d_kopecks, 123_00)
        # two monthly payers and one annual payer counted by the month
        year = admin_service.get_plan("researcher").price_year_kopecks // 12
        month = admin_service.get_plan("researcher").price_month_kopecks
        self.assertEqual(stats.expected_monthly_revenue_kopecks, 2 * month + year)
        self.assertEqual((stats.ai_cost_usd_30d, stats.ai_cost_rub_30d), (1.0, 90.0))

    async def test_the_ai_share_is_the_cost_over_the_revenue(self):
        stats = await admin_service.get_stats(MagicMock())

        self.assertAlmostEqual(
            stats.ai_cost_share_of_revenue, 9000 / stats.expected_monthly_revenue_kopecks, places=4
        )

    async def test_there_is_no_share_while_there_is_no_revenue(self):
        self.paying.return_value = []

        stats = await admin_service.get_stats(MagicMock())

        self.assertEqual(stats.expected_monthly_revenue_kopecks, 0)
        self.assertIsNone(stats.ai_cost_share_of_revenue)


def plan_request(**overrides):
    data = dict(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        plan_code="researcher",
        billing_interval="month",
        contact="@anna",
        comment=None,
        status=PLAN_REQUEST_PENDING,
        processed_by_user_id=None,
        processed_at=None,
        decision_note=None,
        created_at=NOW,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


class CreatePlanRequestTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = session_mock()
        self.user = person()
        self.create = patch.object(
            plan_request_service.plan_request_repository,
            "create_if_none_pending",
            AsyncMock(return_value=plan_request()),
        ).start()
        patch.object(
            plan_request_service.billing_service,
            "ensure_subscription",
            AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4())),
        ).start()
        self.add_event = patch.object(
            plan_request_service.billing_repository, "add_event", AsyncMock()
        ).start()
        self.addCleanup(patch.stopall)

    async def test_a_request_is_stored_and_journaled(self):
        payload = PlanRequestCreate(contact="  @anna  ", comment="  для курсовой ")

        await plan_request_service.create_request(self.session, self.user, payload, NOW)

        kwargs = self.create.await_args.kwargs
        self.assertEqual((kwargs["contact"], kwargs["comment"]), ("@anna", "для курсовой"))
        self.assertEqual(self.add_event.await_args.kwargs["kind"], "plan_request_created")
        self.assertEqual(self.add_event.await_args.kwargs["actor_user_id"], self.user.id)

    async def test_a_second_request_while_one_waits_is_409(self):
        self.create.return_value = None

        with self.assertRaises(HTTPException) as ctx:
            await plan_request_service.create_request(
                self.session, self.user, PlanRequestCreate(contact="@anna"), NOW
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "plan_request_pending")
        self.add_event.assert_not_awaited()

    async def test_only_a_paid_plan_and_a_known_term_can_be_asked_for(self):
        for payload in (
            PlanRequestCreate(contact="@anna", plan_code="start"),
            PlanRequestCreate(contact="@anna", plan_code="nope"),
            PlanRequestCreate(contact="@anna", billing_interval="week"),
        ):
            with self.subTest(payload=payload):
                with self.assertRaises(HTTPException) as ctx:
                    await plan_request_service.create_request(self.session, self.user, payload, NOW)
                self.assertEqual(ctx.exception.status_code, 422)
        self.create.assert_not_awaited()

    def test_the_contact_must_say_something(self):
        for contact in ("", "  ", "ab", "  a "):
            with self.subTest(contact=contact):
                with self.assertRaises(ValueError):
                    PlanRequestCreate(contact=contact)


class DecisionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = session_mock()
        self.admin = person(role=ROLE_ADMIN)
        self.applicant = person()
        self.request = plan_request(user_id=self.applicant.id)
        self.sub = paid_subscription()
        patch.object(
            plan_request_service.plan_request_repository,
            "get_by_id",
            AsyncMock(side_effect=lambda *args, **kwargs: self.request),
        ).start()
        patch.object(
            plan_request_service.user_repository,
            "get_by_id",
            AsyncMock(return_value=self.applicant),
        ).start()
        self.grant = patch.object(
            plan_request_service.lifecycle, "grant", AsyncMock(return_value=self.sub)
        ).start()
        patch.object(
            plan_request_service.billing_service,
            "ensure_subscription",
            AsyncMock(return_value=self.sub),
        ).start()
        self.add_event = patch.object(
            plan_request_service.billing_repository, "add_event", AsyncMock()
        ).start()
        self.addCleanup(patch.stopall)

    async def test_approval_activates_the_plan_for_the_requested_term(self):
        for interval, days in (("month", 30), ("year", 365), ("one_off", 30)):
            with self.subTest(interval=interval):
                self.grant.reset_mock()
                self.request.status = PLAN_REQUEST_PENDING
                self.request.billing_interval = interval

                await plan_request_service.approve(
                    self.session, self.request.id, self.admin, now=NOW
                )

                self.assertEqual(self.grant.await_args.kwargs["days"], days)

    async def test_the_administrator_may_name_another_term(self):
        await plan_request_service.approve(
            self.session, self.request.id, self.admin, days=90, note="оплата по счёту", now=NOW
        )

        self.assertEqual(self.grant.await_args.kwargs["days"], 90)
        self.assertEqual(self.grant.await_args.kwargs["note"], "оплата по счёту")

    async def test_approval_marks_the_request_and_writes_the_event_with_the_actor(self):
        decision = await plan_request_service.approve(
            self.session, self.request.id, self.admin, now=NOW
        )

        self.assertEqual(self.request.status, PLAN_REQUEST_APPROVED)
        self.assertEqual(self.request.processed_by_user_id, self.admin.id)
        self.assertEqual(self.request.processed_at, NOW)
        event = self.add_event.await_args.kwargs
        self.assertEqual(event["kind"], "plan_request_approved")
        self.assertEqual(event["actor_user_id"], self.admin.id)
        self.assertEqual(event["payload"]["request_id"], str(self.request.id))
        self.assertIs(decision.subscription, self.sub)

    async def test_a_decided_request_cannot_be_approved_again(self):
        await plan_request_service.approve(self.session, self.request.id, self.admin, now=NOW)
        self.grant.reset_mock()

        with self.assertRaises(HTTPException) as ctx:
            await plan_request_service.approve(self.session, self.request.id, self.admin, now=NOW)

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["code"], "plan_request_processed")
        self.grant.assert_not_awaited()

    async def test_a_rejected_request_cannot_be_approved(self):
        self.request.status = PLAN_REQUEST_REJECTED

        with self.assertRaises(HTTPException) as ctx:
            await plan_request_service.approve(self.session, self.request.id, self.admin, now=NOW)

        self.assertEqual(ctx.exception.detail["code"], "plan_request_processed")

    async def test_a_disabled_account_gets_no_plan(self):
        self.applicant.is_active = False

        with self.assertRaises(HTTPException) as ctx:
            await plan_request_service.approve(self.session, self.request.id, self.admin, now=NOW)

        self.assertEqual(ctx.exception.detail["code"], "user_inactive")
        self.grant.assert_not_awaited()
        self.assertEqual(self.request.status, PLAN_REQUEST_PENDING)

    async def test_an_unknown_request_is_404(self):
        self.request = None

        with self.assertRaises(HTTPException) as ctx:
            await plan_request_service.approve(self.session, uuid.uuid4(), self.admin, now=NOW)

        self.assertEqual(ctx.exception.status_code, 404)

    async def test_a_failed_grant_leaves_the_request_waiting(self):
        self.grant.side_effect = ValueError("нельзя")

        with self.assertRaises(HTTPException) as ctx:
            await plan_request_service.approve(self.session, self.request.id, self.admin, now=NOW)

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(self.request.status, PLAN_REQUEST_PENDING)

    async def test_rejection_keeps_the_reason_and_gives_no_plan(self):
        await plan_request_service.reject(
            self.session, self.request.id, self.admin, reason="не пришла оплата", now=NOW
        )

        self.assertEqual(self.request.status, PLAN_REQUEST_REJECTED)
        self.assertEqual(self.request.decision_note, "не пришла оплата")
        self.grant.assert_not_awaited()
        event = self.add_event.await_args.kwargs
        self.assertEqual(event["kind"], "plan_request_rejected")
        self.assertEqual(event["actor_user_id"], self.admin.id)

    async def test_a_decided_request_cannot_be_rejected(self):
        self.request.status = PLAN_REQUEST_APPROVED

        with self.assertRaises(HTTPException) as ctx:
            await plan_request_service.reject(self.session, self.request.id, self.admin, now=NOW)

        self.assertEqual(ctx.exception.detail["code"], "plan_request_processed")


class NoticeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.request = plan_request(contact="@anna", comment="привет")
        self.user = person()
        self.addCleanup(patch.stopall)

    async def test_the_administrator_is_told_only_when_an_address_is_set(self):
        sender = patch.object(
            plan_request_service.billing_mail,
            "send_plan_request_to_admin",
            AsyncMock(return_value=True),
        ).start()
        with patch.object(plan_request_service.settings, "ADMIN_NOTIFY_EMAIL", ""):
            await plan_request_service.announce_to_admin(self.request, self.user)
        sender.assert_not_called()

        with patch.object(
            plan_request_service.settings, "ADMIN_NOTIFY_EMAIL", " boss@example.com "
        ):
            await plan_request_service.announce_to_admin(self.request, self.user)

        kwargs = sender.call_args.kwargs
        self.assertEqual(kwargs["to"], "boss@example.com")
        self.assertEqual((kwargs["contact"], kwargs["comment"]), ("@anna", "привет"))

    async def test_a_failing_mail_server_never_breaks_the_notice(self):
        patch.object(
            plan_request_service.billing_mail,
            "send_plan_request_to_admin",
            AsyncMock(side_effect=RuntimeError("smtp down")),
        ).start()

        with patch.object(plan_request_service.settings, "ADMIN_NOTIFY_EMAIL", "boss@example.com"):
            await plan_request_service.announce_to_admin(self.request, self.user)

    async def test_the_person_hears_about_a_decision(self):
        granted = patch.object(
            plan_request_service.billing_mail, "send_plan_granted", AsyncMock(return_value=True)
        ).start()
        refused = patch.object(
            plan_request_service.billing_mail,
            "send_plan_request_rejected",
            AsyncMock(return_value=True),
        ).start()

        approved = plan_request(status=PLAN_REQUEST_APPROVED)
        await plan_request_service.tell_applicant(
            plan_request_service.Decision(approved, self.user, paid_subscription())
        )
        rejected = plan_request(status=PLAN_REQUEST_REJECTED, decision_note="нет оплаты")
        await plan_request_service.tell_applicant(
            plan_request_service.Decision(rejected, self.user, None)
        )

        granted.assert_awaited_once()
        self.assertEqual(refused.await_args.args[1], "нет оплаты")


class RouteTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = session_mock()
        self.admin = person(role=ROLE_ADMIN)
        self.tasks = MagicMock()
        self.decision = plan_request_service.Decision(
            plan_request(status=PLAN_REQUEST_APPROVED), person(), paid_subscription()
        )
        self.approve = patch.object(
            admin_routes.plan_request_service, "approve", AsyncMock(return_value=self.decision)
        ).start()
        self.reject = patch.object(
            admin_routes.plan_request_service, "reject", AsyncMock(return_value=self.decision)
        ).start()
        self.detail = patch.object(
            admin_routes.admin_service, "get_user_detail", AsyncMock(return_value="detail")
        ).start()
        self.addCleanup(patch.stopall)

    async def test_approval_commits_first_and_mails_the_person_afterwards(self):
        view = await admin_routes.approve_plan_request(
            self.decision.request.id,
            AdminApproveRequest(days=45),
            self.session,
            self.admin,
            self.tasks,
        )

        self.assertEqual(view.status, PLAN_REQUEST_APPROVED)
        self.assertEqual(self.approve.await_args.kwargs, {"days": 45, "note": None})
        self.session.commit.assert_awaited_once()
        self.tasks.add_task.assert_called_once_with(
            admin_routes.plan_request_service.tell_applicant, self.decision
        )

    async def test_rejection_commits_and_passes_the_reason(self):
        await admin_routes.reject_plan_request(
            self.decision.request.id,
            AdminRejectRequest(reason="  нет оплаты "),
            self.session,
            self.admin,
            self.tasks,
        )

        self.assertEqual(self.reject.await_args.kwargs, {"reason": "нет оплаты"})
        self.session.commit.assert_awaited_once()

    async def test_a_refused_approval_commits_nothing_and_sends_no_mail(self):
        self.approve.side_effect = HTTPException(
            status_code=409, detail={"code": "plan_request_processed"}
        )

        with self.assertRaises(HTTPException):
            await admin_routes.approve_plan_request(
                self.decision.request.id,
                AdminApproveRequest(),
                self.session,
                self.admin,
                self.tasks,
            )

        self.session.commit.assert_not_awaited()
        self.tasks.add_task.assert_not_called()

    async def test_changes_to_a_person_are_committed_and_the_fresh_card_is_returned(self):
        update = patch.object(admin_routes.admin_service, "update_user", AsyncMock()).start()
        user_id = uuid.uuid4()

        result = await admin_routes.update_user(
            user_id, AdminUserPatch(ai_enabled=False), self.session, self.admin
        )

        self.assertEqual(result, "detail")
        update.assert_awaited_once()
        self.session.commit.assert_awaited_once()


class UserCreatesRequestRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_request_is_committed_and_the_administrator_told_afterwards(self):
        session, tasks, user = session_mock(), MagicMock(), person()
        stored = plan_request(user_id=user.id)
        with patch.object(
            billing_routes.plan_request_service, "create_request", AsyncMock(return_value=stored)
        ):
            info = await billing_routes.create_plan_request(
                PlanRequestCreate(contact="@anna"), session, user, tasks
            )

        self.assertEqual((info.id, info.status), (stored.id, PLAN_REQUEST_PENDING))
        session.commit.assert_awaited_once()
        tasks.add_task.assert_called_once_with(
            billing_routes.plan_request_service.announce_to_admin, stored, user
        )


class LoginTimestampTests(unittest.IsolatedAsyncioTestCase):
    async def test_a_successful_sign_in_records_the_time(self):
        session, user = session_mock(), person(last_login_at=None)
        with (
            patch.object(
                auth_service.user_repository, "get_by_email", AsyncMock(return_value=user)
            ),
            patch.object(auth_service, "is_pending_activation", return_value=False),
            patch.object(auth_service, "verify_password", return_value=True),
        ):
            await auth_service.login(
                session, LoginRequest(email="anna@example.com", password="x" * 8)
            )

        self.assertIsNotNone(user.last_login_at)
        session.commit.assert_awaited_once()

    async def test_a_wrong_password_records_nothing(self):
        session, user = session_mock(), person(last_login_at=None)
        with (
            patch.object(
                auth_service.user_repository, "get_by_email", AsyncMock(return_value=user)
            ),
            patch.object(auth_service, "is_pending_activation", return_value=False),
            patch.object(auth_service, "verify_password", return_value=False),
        ):
            with self.assertRaises(HTTPException):
                await auth_service.login(
                    session, LoginRequest(email="anna@example.com", password="x" * 8)
                )

        self.assertIsNone(user.last_login_at)
        session.commit.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
