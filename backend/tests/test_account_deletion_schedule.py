from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.core.security import hash_password
from app.schemas.auth import DeleteAccountRequest
from app.services import account_deletion_service as service
from app.services import auth_service

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
DAY = timedelta(days=1)
# bcrypt is slow on purpose: hash once, not in every test
PASSWORD_HASH = hash_password("Secret123")


def user_ns(**overrides):
    data = dict(
        id=uuid.uuid4(),
        email="User@Example.com",
        first_name="Анна",
        password_hash=PASSWORD_HASH,
        avatar_url=None,
        deletion_requested_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def paid(end=None, **overrides):
    data = dict(
        id=uuid.uuid4(),
        plan_code="researcher",
        status="active",
        current_period_end=end or NOW + 10 * DAY,
        cancel_at_period_end=False,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def free():
    return paid(plan_code="start", current_period_end=NOW + 25 * DAY)


def org_ns(name="Орг", is_personal=False):
    return SimpleNamespace(id=uuid.uuid4(), name=name, is_personal=is_personal)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    return session


class DeletionCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        auth_service._failed_password_attempts.clear()
        self.repo = {}
        for name, value in {
            "list_owned_organizations": [],
            "count_other_members": 0,
            "list_request_ids": [],
            "list_storage_references": ([], []),
            "delete_requests": None,
            "delete_organization_content": None,
            "delete_invitations_for": None,
            "delete_user": None,
            "list_users_with_scheduled_deletion": [],
        }.items():
            self.repo[name] = patch.object(service.repo, name, AsyncMock(return_value=value)).start()
        patch.object(service.storage_service, "delete_object", AsyncMock()).start()
        patch.object(service.settings, "FILE_STORAGE_BACKEND", "local").start()
        patch.object(service.settings, "BILLING_ENABLED", True).start()
        lifecycle = service.lifecycle
        self.paid = patch.object(
            lifecycle, "active_paid_subscription", AsyncMock(return_value=None)
        ).start()
        self.stop_renewal = patch.object(lifecycle, "cancel_for_account_deletion", AsyncMock()).start()
        patch.object(lifecycle.email_service, "is_configured", return_value=True).start()
        self.add_event = patch.object(service.billing_repository, "add_event", AsyncMock()).start()
        self.get_sub = patch.object(
            service.billing_repository, "get_subscription", AsyncMock(return_value=None)
        ).start()
        self.has_event = patch.object(
            service.billing_repository, "has_event", AsyncMock(return_value=False)
        ).start()
        self.mail = {
            name: patch.object(service.billing_mail, name, AsyncMock(return_value=True)).start()
            for name in ("send_account_deleted", "send_deletion_blocked", "send_deletion_reminder")
        }
        self.session = session_mock()
        self.user = user_ns()
        self.addCleanup(patch.stopall)

    def events(self):
        return [call.kwargs["kind"] for call in self.add_event.await_args_list]


class DeleteWithAPaidPlanTests(DeletionCase):
    async def delete(self, user=None, *, defer=False):
        payload = DeleteAccountRequest(password="Secret123", defer_until_subscription_ends=defer)
        return await service.delete_account(self.session, user or self.user, payload)

    async def test_a_running_paid_period_is_pointed_out_before_anything_happens(self):
        plan = paid()
        self.paid.return_value = plan

        with self.assertRaises(HTTPException) as ctx:
            await self.delete()

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(
            ctx.exception.detail,
            {
                "code": "active_subscription",
                "plan": "researcher",
                "current_period_end": plan.current_period_end.isoformat(),
                "can_defer": True,
            },
        )
        self.repo["delete_user"].assert_not_awaited()
        self.session.commit.assert_not_awaited()
        self.stop_renewal.assert_not_awaited()

    async def test_agreeing_schedules_the_deletion_for_the_end_of_the_period(self):
        plan = paid()
        self.paid.return_value = plan

        outcome = await self.delete(defer=True)

        self.assertFalse(outcome.deleted)
        self.assertEqual(outcome.delete_at, plan.current_period_end)
        self.assertIsNotNone(self.user.deletion_requested_at)
        self.assertTrue(plan.cancel_at_period_end)
        self.assertEqual(self.events(), ["deletion_scheduled"])
        self.assertEqual(self.add_event.await_args.kwargs["payload"], {"delete_at": plan.current_period_end.isoformat()})
        self.session.commit.assert_awaited_once()
        self.repo["delete_user"].assert_not_awaited()

    async def test_asking_again_changes_nothing_and_adds_no_second_entry(self):
        requested = NOW - DAY
        self.user = user_ns(deletion_requested_at=requested)
        self.paid.return_value = paid()

        outcome = await self.delete(defer=True)

        self.assertFalse(outcome.deleted)
        self.assertEqual(self.user.deletion_requested_at, requested)
        self.add_event.assert_not_awaited()

    async def test_without_a_paid_period_renewal_is_stopped_and_the_account_goes_at_once(self):
        outcome = await self.delete()

        self.assertTrue(outcome.deleted)
        self.stop_renewal.assert_awaited_once_with(self.session, self.user.id)
        self.repo["delete_user"].assert_awaited_once_with(self.session, self.user.id)

    async def test_a_trial_or_a_late_payment_is_not_a_paid_period(self):
        # active_paid_subscription answers None for them, so the account is deleted right away
        self.paid.return_value = None

        self.assertTrue((await self.delete(defer=True)).deleted)

    async def test_with_billing_off_the_plan_is_not_even_looked_at(self):
        with patch.object(service.settings, "BILLING_ENABLED", False):
            outcome = await self.delete()

        self.assertTrue(outcome.deleted)
        self.paid.assert_not_awaited()
        self.stop_renewal.assert_not_awaited()

    async def test_organizations_with_other_people_are_checked_first(self):
        self.repo["list_owned_organizations"].return_value = [org_ns("Команда")]
        self.repo["count_other_members"].return_value = 2
        self.paid.return_value = paid()

        with self.assertRaises(HTTPException) as ctx:
            await self.delete(defer=True)

        self.assertIn("«Команда»", ctx.exception.detail)
        self.paid.assert_not_awaited()
        self.assertIsNone(self.user.deletion_requested_at)

    async def test_a_wrong_password_schedules_nothing(self):
        with self.assertRaises(HTTPException) as ctx:
            await service.delete_account(
                self.session, self.user, DeleteAccountRequest(password="nope", defer_until_subscription_ends=True)
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIsNone(self.user.deletion_requested_at)


class CancelScheduledDeletionTests(DeletionCase):
    async def test_the_person_changes_their_mind(self):
        self.user = user_ns(deletion_requested_at=NOW)
        self.get_sub.return_value = paid(cancel_at_period_end=True)

        self.assertTrue(await service.cancel_scheduled_deletion(self.session, self.user))

        self.assertIsNone(self.user.deletion_requested_at)
        self.assertEqual(self.events(), ["deletion_canceled"])
        self.session.commit.assert_awaited_once()

    async def test_renewal_stays_off_until_the_person_switches_it_on(self):
        self.user = user_ns(deletion_requested_at=NOW)
        plan = paid(cancel_at_period_end=True)
        self.get_sub.return_value = plan

        await service.cancel_scheduled_deletion(self.session, self.user)

        self.assertTrue(plan.cancel_at_period_end)

    async def test_cancelling_nothing_is_not_an_error(self):
        self.assertFalse(await service.cancel_scheduled_deletion(self.session, self.user))

        self.add_event.assert_not_awaited()
        self.session.commit.assert_not_awaited()


class ScheduledDeletionTickTests(DeletionCase):
    def waiting(self, *users):
        self.repo["list_users_with_scheduled_deletion"].side_effect = [[u] for u in users] + [[]]

    async def tick(self):
        return await service.process_scheduled_deletions(self.session, NOW)

    async def test_the_account_goes_when_the_paid_period_is_over_and_the_person_is_told(self):
        user = user_ns(deletion_requested_at=NOW - 30 * DAY)
        self.waiting(user)
        self.get_sub.return_value = free()
        with patch.object(service, "purge_account", AsyncMock()) as purge:
            done = await self.tick()

        purge.assert_awaited_once_with(self.session, user)
        self.assertEqual(dict(done), {"deleted": 1})
        self.mail["send_account_deleted"].assert_awaited_once_with("User@Example.com", "Анна")

    async def test_nothing_happens_while_the_paid_period_is_running(self):
        self.waiting(user_ns(deletion_requested_at=NOW - DAY))
        self.get_sub.return_value = paid(end=NOW + DAY)
        with patch.object(service, "purge_account", AsyncMock()) as purge:
            done = await self.tick()

        purge.assert_not_awaited()
        self.assertEqual(dict(done), {})

    async def test_a_grant_that_extends_the_period_moves_the_date(self):
        user = user_ns(deletion_requested_at=NOW - DAY)
        self.waiting(user)
        plan = paid(end=NOW - DAY)
        self.get_sub.return_value = plan
        with patch.object(service, "purge_account", AsyncMock()) as purge:
            plan.current_period_end = NOW + 30 * DAY  # the period was extended after it was scheduled
            await self.tick()

        purge.assert_not_awaited()

    async def test_an_account_without_a_subscription_is_deleted(self):
        self.waiting(user_ns(deletion_requested_at=NOW - DAY))
        self.get_sub.return_value = None
        with patch.object(service, "purge_account", AsyncMock()) as purge:
            await self.tick()

        purge.assert_awaited_once()

    async def test_organizations_with_other_people_stop_the_deletion_and_the_person_is_told(self):
        user = user_ns(deletion_requested_at=NOW - 30 * DAY)
        self.waiting(user)
        self.get_sub.return_value = free()
        error = service.SharedOrganizationsError(["Команда"])
        with patch.object(service, "purge_account", AsyncMock(side_effect=error)):
            done = await self.tick()

        self.assertIsNone(user.deletion_requested_at)
        self.assertEqual(self.events(), ["deletion_blocked"])
        self.assertEqual(self.add_event.await_args.kwargs["payload"], {"organizations": ["Команда"]})
        self.session.commit.assert_awaited_once()
        self.mail["send_deletion_blocked"].assert_awaited_once_with(user, ["Команда"])
        self.assertEqual(dict(done), {"blocked": 1})
        self.mail["send_account_deleted"].assert_not_awaited()

    async def test_a_failure_leaves_the_account_for_the_next_tick_and_goes_on(self):
        broken, fine = user_ns(deletion_requested_at=NOW - DAY), user_ns(deletion_requested_at=NOW - DAY)
        self.waiting(broken, fine)
        self.get_sub.return_value = free()
        with (
            patch.object(service, "purge_account", AsyncMock(side_effect=[RuntimeError("db"), None])),
            self.assertLogs(service.logger, level="ERROR"),
        ):
            done = await self.tick()

        self.session.rollback.assert_awaited_once()
        self.assertEqual(dict(done), {"deleted": 1})
        self.assertIsNotNone(broken.deletion_requested_at)

    async def test_accounts_are_paged_by_id(self):
        first = user_ns(deletion_requested_at=NOW - DAY)
        self.waiting(first)
        self.get_sub.return_value = paid(end=NOW + DAY)

        await self.tick()

        calls = self.repo["list_users_with_scheduled_deletion"].await_args_list
        self.assertIsNone(calls[0].kwargs["after_id"])
        self.assertEqual(calls[1].kwargs["after_id"], first.id)


class PurgeAccountTests(DeletionCase):
    async def test_without_a_password_shared_organizations_still_stop_it(self):
        self.repo["list_owned_organizations"].return_value = [org_ns("Команда")]
        self.repo["count_other_members"].return_value = 1

        with self.assertRaises(service.SharedOrganizationsError) as ctx:
            await service.purge_account(self.session, self.user)

        self.assertEqual(ctx.exception.names, ["Команда"])
        self.repo["delete_user"].assert_not_awaited()

    async def test_otherwise_everything_goes(self):
        await service.purge_account(self.session, self.user)

        self.repo["delete_user"].assert_awaited_once_with(self.session, self.user.id)
        self.session.commit.assert_awaited_once()


class ReminderTests(DeletionCase):
    def scheduled(self, *, left: timedelta, asked_ago: timedelta, **plan):
        end = NOW + left
        user = user_ns(deletion_requested_at=NOW - asked_ago)
        self.repo["list_users_with_scheduled_deletion"].side_effect = [[user], []]
        self.get_sub.return_value = paid(end=end, **plan)
        return user, end

    async def remind(self):
        return await service.send_deletion_reminders(self.session, NOW)

    async def test_a_week_before_the_week_reminder_goes_out_once(self):
        user, end = self.scheduled(left=6 * DAY, asked_ago=10 * DAY)

        self.assertEqual(await self.remind(), 1)

        self.mail["send_deletion_reminder"].assert_awaited_once_with(user, end, 7)
        self.assertEqual(self.events(), ["deletion_reminder_7d"])
        self.assertEqual(self.add_event.await_args.kwargs["payload"], {"delete_at": end.isoformat()})

    async def test_a_day_before_only_the_day_reminder_goes_out(self):
        user, end = self.scheduled(left=timedelta(hours=12), asked_ago=10 * DAY)

        self.assertEqual(await self.remind(), 1)

        self.mail["send_deletion_reminder"].assert_awaited_once_with(user, end, 1)
        self.assertEqual(self.events(), ["deletion_reminder_1d"])

    async def test_a_reminder_that_was_sent_is_not_sent_again(self):
        self.scheduled(left=timedelta(hours=12), asked_ago=10 * DAY)
        self.has_event.return_value = True

        self.assertEqual(await self.remind(), 0)

        self.mail["send_deletion_reminder"].assert_not_awaited()

    async def test_a_new_date_after_an_extension_is_reminded_again(self):
        self.scheduled(left=timedelta(hours=12), asked_ago=10 * DAY)
        old = "2026-10-25T12:00:00+00:00"

        async def seen_before(session, sub_id, kind, match):
            return match["delete_at"] == old

        self.has_event.side_effect = seen_before

        self.assertEqual(await self.remind(), 1)

    async def test_nobody_is_reminded_of_a_deletion_asked_for_too_late_for_it(self):
        # Asked 2 hours ago for a deletion 12 hours away: both thresholds are already behind
        self.scheduled(left=timedelta(hours=12), asked_ago=timedelta(hours=2))

        self.assertEqual(await self.remind(), 0)

        self.mail["send_deletion_reminder"].assert_not_awaited()

    async def test_nothing_before_the_week_threshold(self):
        self.scheduled(left=9 * DAY, asked_ago=DAY)

        self.assertEqual(await self.remind(), 0)

    async def test_an_account_whose_paid_period_is_over_is_not_reminded(self):
        self.scheduled(left=-DAY, asked_ago=10 * DAY)

        self.assertEqual(await self.remind(), 0)

    async def test_an_email_that_failed_is_tried_again_on_the_next_tick(self):
        self.scheduled(left=6 * DAY, asked_ago=10 * DAY)
        self.mail["send_deletion_reminder"].return_value = False

        self.assertEqual(await self.remind(), 0)

        self.add_event.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
