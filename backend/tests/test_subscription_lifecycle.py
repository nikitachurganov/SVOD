from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.services import billing_service
from app.services import subscription_lifecycle_service as lifecycle
from tests.limited_plans import LIMITED_START

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
DAY = timedelta(days=1)


def sub(**overrides):
    data = dict(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        plan_code="researcher",
        status="active",
        billing_interval="one_off",
        current_period_start=NOW - 10 * DAY,
        current_period_end=NOW + 20 * DAY,
        trial_ends_at=None,
        trial_used_at=None,
        cancel_at_period_end=False,
        limit_overrides=None,
        provider=None,
        provider_subscription_id=None,
        payment_method_ref=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def free(**overrides):
    return sub(
        plan_code="start",
        billing_interval="none",
        current_period_start=NOW - DAY,
        current_period_end=NOW + 29 * DAY,
        **overrides,
    )


def person(**overrides):
    data = dict(
        id=uuid.uuid4(),
        email="anna@example.com",
        first_name="Анна",
        email_verified_at=NOW - 30 * DAY,
        deletion_requested_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def session_mock():
    session = MagicMock()
    for name in ("flush", "commit", "rollback"):
        setattr(session, name, AsyncMock())
    return session


class LifecycleCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = session_mock()
        self.sub = free()
        self.user = person()
        self.ensure = patch.object(
            lifecycle.billing_service, "ensure_subscription", AsyncMock(side_effect=lambda *a, **k: self.sub)
        ).start()
        self.unlock = patch.object(
            lifecycle.billing_service, "unlock_responses", AsyncMock(return_value=0)
        ).start()
        self.add_event = patch.object(lifecycle.billing_repository, "add_event", AsyncMock()).start()
        self.get_user = patch.object(
            lifecycle.user_repository, "get_by_id", AsyncMock(side_effect=lambda *a, **k: self.user)
        ).start()
        patch.object(lifecycle.settings, "BILLING_PAST_DUE_GRACE_DAYS", 3).start()
        patch.object(lifecycle.settings, "BILLING_TRIAL_DAYS", 14).start()
        patch.object(lifecycle.settings, "BILLING_ENFORCE", True).start()
        self.smtp = patch.object(lifecycle.email_service, "is_configured", return_value=True).start()
        self.addCleanup(patch.stopall)

    def events(self):
        return [call.kwargs["kind"] for call in self.add_event.await_args_list]


class GrantTests(LifecycleCase):
    async def grant(self, **kwargs):
        kwargs.setdefault("days", 30)
        return await lifecycle.grant(self.session, self.sub.user_id, "researcher", now=NOW, **kwargs)

    async def test_a_free_account_gets_the_plan_for_the_number_of_days(self):
        admin = uuid.uuid4()

        result = await self.grant(actor_user_id=admin, note="счёт 42")

        self.assertIs(result, self.sub)
        self.assertEqual((self.sub.plan_code, self.sub.status, self.sub.billing_interval), ("researcher", "active", "one_off"))
        self.assertEqual((self.sub.current_period_start, self.sub.current_period_end), (NOW, NOW + 30 * DAY))
        kwargs = self.add_event.await_args.kwargs
        self.assertEqual(kwargs["kind"], "manual_grant")
        self.assertEqual(kwargs["actor_user_id"], admin)
        self.assertEqual(kwargs["payload"]["note"], "счёт 42")
        self.assertFalse(kwargs["payload"]["extended"])
        self.unlock.assert_awaited_once()
        self.assertEqual(self.unlock.await_args.kwargs["actor_user_id"], admin)

    async def test_days_extend_a_period_that_is_running(self):
        self.sub = sub(current_period_start=NOW - 10 * DAY, current_period_end=NOW + 5 * DAY)

        await self.grant()

        self.assertEqual(self.sub.current_period_start, NOW - 10 * DAY)
        self.assertEqual(self.sub.current_period_end, NOW + 35 * DAY)
        self.assertTrue(self.add_event.await_args.kwargs["payload"]["extended"])

    async def test_a_date_sets_the_end_and_never_shortens_a_longer_period(self):
        await self.grant(days=None, until=NOW + 40 * DAY)
        self.assertEqual(self.sub.current_period_end, NOW + 40 * DAY)

        await self.grant(days=None, until=NOW + 10 * DAY)
        self.assertEqual(self.sub.current_period_end, NOW + 40 * DAY)

    async def test_a_trial_is_replaced_by_the_granted_plan(self):
        self.sub = sub(
            status="trialing",
            billing_interval="none",
            trial_ends_at=NOW + 3 * DAY,
            trial_used_at=NOW - 11 * DAY,
            current_period_end=NOW + 3 * DAY,
        )

        await self.grant()

        self.assertEqual(self.sub.status, "active")
        self.assertIsNone(self.sub.trial_ends_at)
        self.assertEqual(self.sub.trial_used_at, NOW - 11 * DAY)
        self.assertEqual(self.sub.current_period_end, NOW + 30 * DAY)

    async def test_a_period_that_is_over_does_not_count_as_running(self):
        self.sub = sub(current_period_start=NOW - 40 * DAY, current_period_end=NOW - 10 * DAY)

        await self.grant()

        self.assertEqual((self.sub.current_period_start, self.sub.current_period_end), (NOW, NOW + 30 * DAY))

    async def test_bad_requests_are_refused_before_anything_changes(self):
        cases = (
            dict(plan="start", days=30),
            dict(plan="gold", days=30),
            dict(plan="researcher", days=None),
            dict(plan="researcher", days=30, until=NOW + DAY),
            dict(plan="researcher", days=0),
            dict(plan="researcher", days=None, until=NOW - DAY),
        )
        for case in cases:
            with self.subTest(case=case):
                plan = case.pop("plan")
                with self.assertRaises(ValueError):
                    await lifecycle.grant(self.session, self.sub.user_id, plan, now=NOW, **case)

        self.assertEqual(self.sub.plan_code, "start")
        self.add_event.assert_not_awaited()

    async def test_individual_limits_are_cleaned_and_can_be_cleared(self):
        await self.grant(limit_overrides={"ai_tokens_per_period": 500, "junk": 1, "max_projects": -3})
        self.assertEqual(self.sub.limit_overrides, {"ai_tokens_per_period": 500})

        await self.grant(limit_overrides={})
        self.assertIsNone(self.sub.limit_overrides)

        self.sub.limit_overrides = {"max_projects": 7}
        await self.grant()
        self.assertEqual(self.sub.limit_overrides, {"max_projects": 7})

    async def test_the_pack_can_be_granted_to_a_free_account(self):
        await lifecycle.grant(self.session, self.sub.user_id, "pack", days=60, now=NOW)

        self.assertEqual((self.sub.plan_code, self.sub.status), ("pack", "active"))
        self.assertEqual((self.sub.current_period_start, self.sub.current_period_end), (NOW, NOW + 60 * DAY))

    async def test_a_new_pack_is_a_fresh_allowance_and_does_not_extend_the_running_one(self):
        self.sub = sub(plan_code="pack", current_period_start=NOW - 50 * DAY, current_period_end=NOW + 10 * DAY)

        await lifecycle.grant(self.session, self.sub.user_id, "pack", days=60, now=NOW)

        self.assertEqual((self.sub.current_period_start, self.sub.current_period_end), (NOW, NOW + 60 * DAY))
        self.assertFalse(self.add_event.await_args.kwargs["payload"]["extended"])

    async def test_a_pack_does_not_replace_a_running_subscription(self):
        self.sub = sub(current_period_start=NOW - 10 * DAY, current_period_end=NOW + 5 * DAY)

        with self.assertRaises(ValueError):
            await lifecycle.grant(self.session, self.sub.user_id, "pack", days=60, now=NOW)

        self.assertEqual(self.sub.plan_code, "researcher")
        self.assertEqual(self.sub.current_period_end, NOW + 5 * DAY)

    async def test_renewal_is_switched_back_on_unless_the_account_is_to_be_deleted(self):
        self.sub = sub(cancel_at_period_end=True)
        await self.grant()
        self.assertFalse(self.sub.cancel_at_period_end)

        self.sub.cancel_at_period_end = True
        self.user = person(deletion_requested_at=NOW - DAY)
        await self.grant()
        self.assertTrue(self.sub.cancel_at_period_end)


class TrialTests(LifecycleCase):
    async def test_the_trial_starts_for_the_configured_number_of_days(self):
        await lifecycle.start_trial(self.session, self.user, now=NOW)

        self.assertEqual((self.sub.plan_code, self.sub.status, self.sub.billing_interval), ("researcher", "trialing", "none"))
        self.assertEqual((self.sub.current_period_start, self.sub.current_period_end), (NOW, NOW + 14 * DAY))
        self.assertEqual((self.sub.trial_ends_at, self.sub.trial_used_at), (NOW + 14 * DAY, NOW))
        self.assertEqual(self.events(), ["trial_started"])
        # A trial does not open what the quota kept back: only a paid plan does
        self.unlock.assert_not_awaited()

    async def test_the_mailbox_must_be_confirmed_when_the_server_can_send_mail(self):
        user = person(email_verified_at=None)

        with self.assertRaises(HTTPException) as ctx:
            await lifecycle.start_trial(self.session, user, now=NOW)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail["code"], "email_not_verified")
        self.assertEqual(self.sub.plan_code, "start")

    async def test_without_smtp_nobody_is_asked_to_confirm(self):
        self.smtp.return_value = False

        await lifecycle.start_trial(self.session, person(email_verified_at=None), now=NOW)

        self.assertEqual(self.sub.status, "trialing")

    async def test_the_trial_is_given_once(self):
        self.sub = free(trial_used_at=NOW - 100 * DAY)

        with self.assertRaises(HTTPException) as ctx:
            await lifecycle.start_trial(self.session, self.user, now=NOW)

        self.assertEqual((ctx.exception.status_code, ctx.exception.detail["code"]), (409, "trial_used"))

    async def test_someone_with_a_paid_plan_does_not_need_it(self):
        self.sub = sub()

        with self.assertRaises(HTTPException) as ctx:
            await lifecycle.start_trial(self.session, self.user, now=NOW)

        self.assertEqual(ctx.exception.detail["code"], "already_subscribed")

    async def test_a_paid_plan_that_ran_out_can_still_take_the_trial(self):
        self.sub = sub(current_period_end=NOW - DAY)

        await lifecycle.start_trial(self.session, self.user, now=NOW)

        self.assertEqual(self.sub.status, "trialing")


class CancelResumeTests(LifecycleCase):
    async def test_cancelling_switches_the_renewal_off_and_is_journalled_once(self):
        self.sub = sub()

        await lifecycle.cancel(self.session, self.sub.user_id, now=NOW)
        await lifecycle.cancel(self.session, self.sub.user_id, now=NOW)

        self.assertTrue(self.sub.cancel_at_period_end)
        self.assertEqual(self.events(), ["canceled"])

    async def test_there_is_nothing_to_cancel_on_the_free_plan_or_after_the_end(self):
        for state in (free(), sub(current_period_end=NOW - DAY)):
            with self.subTest(plan=state.plan_code):
                self.sub = state
                with self.assertRaises(HTTPException) as ctx:
                    await lifecycle.cancel(self.session, state.user_id, now=NOW)
                self.assertEqual(ctx.exception.detail["code"], "nothing_to_cancel")

    async def test_resume_takes_the_cancellation_back(self):
        self.sub = sub(cancel_at_period_end=True)

        await lifecycle.resume(self.session, self.user, now=NOW)
        await lifecycle.resume(self.session, self.user, now=NOW)

        self.assertFalse(self.sub.cancel_at_period_end)
        self.assertEqual(self.events(), ["resumed"])

    async def test_resume_on_the_free_plan_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            await lifecycle.resume(self.session, self.user, now=NOW)
        self.assertEqual(ctx.exception.detail["code"], "nothing_to_resume")

    async def test_renewal_cannot_be_resumed_while_the_account_is_to_be_deleted(self):
        self.sub = sub(cancel_at_period_end=True)
        user = person(deletion_requested_at=NOW - DAY)

        with self.assertRaises(HTTPException) as ctx:
            await lifecycle.resume(self.session, user, now=NOW)

        self.assertEqual(ctx.exception.detail["code"], "deletion_scheduled")
        self.assertTrue(self.sub.cancel_at_period_end)


class AccountDeletionHelpersTests(LifecycleCase):
    def subscription_is(self, value):
        return patch.object(
            lifecycle.billing_repository, "get_subscription", AsyncMock(return_value=value)
        )

    async def test_only_a_running_active_paid_period_counts_as_paid(self):
        cases = (
            (sub(), True),
            (sub(status="trialing", trial_ends_at=NOW + DAY, current_period_end=NOW + DAY), False),
            (sub(status="past_due", current_period_end=NOW - DAY), False),
            (sub(current_period_end=NOW), False),
            (sub(current_period_end=NOW - DAY), False),
            (free(), False),
            (None, False),
        )
        for state, paid in cases:
            with self.subTest(state=getattr(state, "status", None), plan=getattr(state, "plan_code", None)):
                with self.subscription_is(state):
                    found = await lifecycle.active_paid_subscription(self.session, uuid.uuid4(), now=NOW)
                self.assertEqual(found is not None, paid)

    async def test_deleting_stops_the_renewal_of_a_paid_plan_only(self):
        paid, plain, nothing = sub(), free(), None
        for state in (paid, plain, nothing):
            with self.subscription_is(state):
                await lifecycle.cancel_for_account_deletion(self.session, uuid.uuid4())

        self.assertTrue(paid.cancel_at_period_end)
        self.assertFalse(plain.cancel_at_period_end)


class DowngradeTests(LifecycleCase):
    def setUp(self):
        super().setUp()
        repo = lifecycle.survey_repository
        self.open_ids = [uuid.uuid4() for _ in range(5)]
        self.list_open = patch.object(
            repo, "list_open_survey_ids_by_activity", AsyncMock(return_value=self.open_ids)
        ).start()
        self.close = patch.object(repo, "close_surveys", AsyncMock(return_value=2)).start()

    def limit_the_free_plan(self):
        # The catalogue does not limit surveys; the downgrade still honours a limit if there is one
        patch.object(lifecycle, "START", LIMITED_START).start()

    async def test_the_free_plan_closes_nothing_because_it_limits_no_survey(self):
        self.assertEqual(await lifecycle.enforce_downgrade(self.session, self.sub.user_id), [])

        self.close.assert_not_awaited()
        self.add_event.assert_not_awaited()

    async def test_a_limited_free_plan_keeps_the_three_most_active_surveys_open(self):
        self.limit_the_free_plan()

        closed = await lifecycle.enforce_downgrade(self.session, self.sub.user_id)

        self.assertEqual(closed, self.open_ids[3:])
        self.close.assert_awaited_once_with(self.session, self.open_ids[3:])
        kwargs = self.add_event.await_args.kwargs
        self.assertEqual(kwargs["kind"], "downgrade_closed_surveys")
        self.assertEqual(kwargs["payload"]["count"], 2)

    async def test_within_the_limit_nothing_is_closed_or_journalled(self):
        self.limit_the_free_plan()
        self.list_open.return_value = self.open_ids[:3]

        self.assertEqual(await lifecycle.enforce_downgrade(self.session, self.sub.user_id), [])

        self.close.assert_not_awaited()
        self.add_event.assert_not_awaited()

    async def test_an_expired_paid_subscription_becomes_a_free_one(self):
        self.limit_the_free_plan()
        paid = sub(
            current_period_start=NOW - 40 * DAY,
            current_period_end=NOW - 5 * DAY,
            limit_overrides={"max_projects": 9},
            cancel_at_period_end=True,
            provider="yookassa",
            provider_subscription_id="s1",
            payment_method_ref="pm1",
        )

        closed = await lifecycle.expire_subscription(self.session, paid, NOW, "period_ended")

        self.assertEqual(closed, 2)
        self.assertEqual((paid.plan_code, paid.status, paid.billing_interval), ("start", "active", "none"))
        # The free window starts where access ended, not when the worker noticed
        self.assertEqual((paid.current_period_start, paid.current_period_end), (NOW - 5 * DAY, NOW + 25 * DAY))
        self.assertIsNone(paid.limit_overrides)
        self.assertFalse(paid.cancel_at_period_end)
        self.assertEqual((paid.provider, paid.provider_subscription_id, paid.payment_method_ref), (None, None, None))
        expired = [c for c in self.add_event.await_args_list if c.kwargs["kind"] == "expired"][0]
        self.assertEqual(expired.kwargs["payload"], {"from_plan": "researcher", "reason": "period_ended"})

    async def test_the_trial_keeps_its_mark_after_it_ends(self):
        trial = sub(
            status="trialing",
            trial_ends_at=NOW - DAY,
            trial_used_at=NOW - 15 * DAY,
            current_period_end=NOW - DAY,
        )

        await lifecycle.expire_subscription(self.session, trial, NOW, "trial_ended")

        self.assertIsNone(trial.trial_ends_at)
        self.assertEqual(trial.trial_used_at, NOW - 15 * DAY)


class WorkerCase(LifecycleCase):
    def setUp(self):
        super().setUp()
        repo = lifecycle.billing_repository
        self.list_due = patch.object(repo, "list_due_subscriptions", AsyncMock(return_value=[])).start()
        self.list_trials = patch.object(repo, "list_ending_trials", AsyncMock(return_value=[])).start()
        self.list_plans = patch.object(repo, "list_ending_plans", AsyncMock(return_value=[])).start()
        self.has_event = patch.object(repo, "has_event", AsyncMock(return_value=False)).start()
        self.unsent = patch.object(repo, "list_unsent_events", AsyncMock(return_value=[])).start()
        self.expire = patch.object(lifecycle, "expire_subscription", AsyncMock(return_value=0)).start()
        mail = lifecycle.billing_mail
        self.mail = {
            name: patch.object(mail, name, AsyncMock(return_value=True)).start()
            for name in (
                "send_trial_ending",
                "send_trial_ended",
                "send_plan_ending",
                "send_plan_ended",
                "send_limit_warning",
            )
        }

    def due(self, *states):
        """list_due_subscriptions answers with one subscription at a time, then nothing."""
        self.list_due.side_effect = [[state] for state in states] + [[]]


class ExpireDueTests(WorkerCase):
    async def test_a_trial_that_ended_becomes_free_and_the_person_is_told(self):
        trial = sub(status="trialing", trial_ends_at=NOW - DAY, current_period_end=NOW - DAY)
        self.due(trial)
        self.expire.return_value = 2

        expired = await lifecycle._expire_due(self.session, NOW)

        self.assertEqual(expired, 1)
        self.expire.assert_awaited_once_with(self.session, trial, NOW, "trial_ended")
        self.session.commit.assert_awaited_once()
        self.mail["send_trial_ended"].assert_awaited_once_with(self.user, 2)

    async def test_a_paid_period_that_ended_is_reported_with_the_plan_name(self):
        self.due(sub(current_period_end=NOW - 3 * DAY))

        await lifecycle._expire_due(self.session, NOW)

        self.expire.assert_awaited_once()
        self.assertEqual(self.expire.await_args.args[3], "period_ended")
        self.mail["send_plan_ended"].assert_awaited_once_with(self.user, "Исследователь", 0)

    async def test_a_late_payment_keeps_the_plan_during_the_grace_period_and_loses_it_after(self):
        within = sub(status="past_due", current_period_end=NOW - 2 * DAY)
        over = sub(status="past_due", current_period_end=NOW - 4 * DAY)
        self.due(within, over)

        expired = await lifecycle._expire_due(self.session, NOW)

        self.assertEqual(expired, 1)
        self.assertEqual(self.expire.await_args.args[1], over)
        self.assertEqual(self.expire.await_args.args[3], "grace_over")

    async def test_a_renewing_paid_subscription_is_left_to_the_payment_flow(self):
        renewing = sub(provider="yookassa", billing_interval="month", current_period_end=NOW - DAY)
        cancelled = sub(provider="yookassa", billing_interval="month", cancel_at_period_end=True, current_period_end=NOW - DAY)
        self.due(renewing, cancelled)

        expired = await lifecycle._expire_due(self.session, NOW)

        self.assertEqual(expired, 1)
        self.assertEqual(self.expire.await_args.args[1], cancelled)

    async def test_a_failure_for_one_subscription_does_not_stop_the_others(self):
        broken, fine = sub(current_period_end=NOW - DAY), sub(current_period_end=NOW - DAY)
        self.due(broken, fine)
        self.expire.side_effect = [RuntimeError("database hiccup"), 0]

        with self.assertLogs(lifecycle.logger, level="ERROR"):
            expired = await lifecycle._expire_due(self.session, NOW)

        self.assertEqual(expired, 1)
        self.session.rollback.assert_awaited()
        self.assertEqual(self.mail["send_plan_ended"].await_count, 1)

    async def test_rows_are_paged_by_id_so_a_skipped_one_cannot_loop(self):
        first = sub(current_period_end=NOW - DAY)
        self.due(first)

        await lifecycle._expire_due(self.session, NOW)

        calls = self.list_due.await_args_list
        self.assertIsNone(calls[0].kwargs["after_id"])
        self.assertEqual(calls[1].kwargs["after_id"], first.id)


class ReminderTests(WorkerCase):
    async def test_the_trial_reminder_goes_out_once(self):
        trial = sub(status="trialing", trial_ends_at=NOW + DAY, current_period_end=NOW + DAY)
        self.list_trials.side_effect = [[trial], []]

        sent = await lifecycle._remind_trials(self.session, NOW)

        self.assertEqual(sent, 1)
        self.mail["send_trial_ending"].assert_awaited_once_with(self.user, trial.trial_ends_at)
        self.assertEqual(self.events(), ["trial_ending_notified"])
        self.assertEqual(self.list_trials.await_args_list[0].args[2], NOW + 2 * DAY)

    async def test_a_reminder_already_sent_is_not_repeated(self):
        trial = sub(status="trialing", trial_ends_at=NOW + DAY)
        self.list_trials.side_effect = [[trial], []]
        self.has_event.return_value = True

        self.assertEqual(await lifecycle._remind_trials(self.session, NOW), 0)

        self.mail["send_trial_ending"].assert_not_awaited()

    async def test_an_email_that_failed_is_retried_on_the_next_tick(self):
        trial = sub(status="trialing", trial_ends_at=NOW + DAY)
        self.list_trials.side_effect = [[trial], []]
        self.mail["send_trial_ending"].return_value = False

        self.assertEqual(await lifecycle._remind_trials(self.session, NOW), 0)

        self.add_event.assert_not_awaited()

    async def test_without_smtp_the_moment_is_marked_so_it_does_not_loop(self):
        self.smtp.return_value = False
        trial = sub(status="trialing", trial_ends_at=NOW + DAY)
        self.list_trials.side_effect = [[trial], []]
        self.mail["send_trial_ending"].return_value = False

        self.assertEqual(await lifecycle._remind_trials(self.session, NOW), 1)

        self.assertEqual(self.events(), ["trial_ending_notified"])

    async def test_the_plan_reminder_names_the_period_it_is_about(self):
        ending = sub(current_period_end=NOW + 2 * DAY)
        self.list_plans.side_effect = [[ending], []]

        sent = await lifecycle._remind_expiring(self.session, NOW)

        self.assertEqual(sent, 1)
        self.mail["send_plan_ending"].assert_awaited_once_with(self.user, "Исследователь", ending.current_period_end)
        kwargs = self.add_event.await_args.kwargs
        self.assertEqual(kwargs["payload"], {"period_end": ending.current_period_end.isoformat()})
        self.assertEqual(self.has_event.await_args.args[3], kwargs["payload"])

    async def test_a_renewing_subscription_gets_no_ending_reminder(self):
        renewing = sub(provider="yookassa", billing_interval="month", current_period_end=NOW + DAY)
        self.list_plans.side_effect = [[renewing], []]

        self.assertEqual(await lifecycle._remind_expiring(self.session, NOW), 0)


class LimitWarningTests(WorkerCase):
    def event(self, age_hours=1, **payload):
        data = {"metric": "ai_actions", "used": 12, "limit": 15, "sent": False}
        data.update(payload)
        return SimpleNamespace(
            subscription_id=uuid.uuid4(), payload=data, created_at=NOW - timedelta(hours=age_hours)
        )

    def with_subscription(self):
        return patch.object(
            self.session, "get", AsyncMock(return_value=SimpleNamespace(user_id=uuid.uuid4())), create=True
        )

    async def test_a_queued_warning_is_emailed_and_marked_sent(self):
        event = self.event()
        self.unsent.return_value = [event]

        with self.with_subscription():
            sent = await lifecycle._send_limit_warnings(self.session, NOW)

        self.assertEqual(sent, 1)
        self.mail["send_limit_warning"].assert_awaited_once_with(self.user, "ai_actions", 12, 15)
        self.assertTrue(event.payload["sent"])
        self.session.commit.assert_awaited()

    async def test_a_failed_email_stays_queued_for_a_day_and_then_is_given_up(self):
        self.mail["send_limit_warning"].return_value = False
        recent, stale = self.event(age_hours=1), self.event(age_hours=30)
        self.unsent.return_value = [recent, stale]

        with self.with_subscription():
            sent = await lifecycle._send_limit_warnings(self.session, NOW)

        self.assertEqual(sent, 0)
        self.assertFalse(recent.payload["sent"])
        self.assertTrue(stale.payload["sent"])

    async def test_warnings_are_queued_exactly_when_the_threshold_is_crossed(self):
        period = NOW - 10 * DAY
        queued = await lifecycle.warn_if_near_limit(self.session, self.sub.user_id, "ai_actions", 12, 15, period)

        self.assertTrue(queued)
        kwargs = self.add_event.await_args.kwargs
        self.assertEqual(kwargs["kind"], "limit_warning")
        self.assertEqual(
            kwargs["payload"],
            {"metric": "ai_actions", "period_start": period.isoformat(), "used": 12, "limit": 15, "sent": False},
        )

    async def test_no_warning_before_or_after_the_threshold(self):
        for used in (11, 13, 15):
            with self.subTest(used=used):
                self.assertFalse(
                    await lifecycle.warn_if_near_limit(self.session, self.sub.user_id, "ai_actions", used, 15, NOW)
                )
        self.add_event.assert_not_awaited()

    async def test_a_jump_over_the_threshold_queues_the_warning_once(self):
        # AI tokens grow in jumps: 110 000 -> 130 000 of 150 000 passes the 120 000 threshold
        crossed = await lifecycle.warn_if_near_limit(
            self.session, self.sub.user_id, "ai_tokens", 130_000, 150_000, NOW, previous=110_000
        )
        self.assertTrue(crossed)

        for previous, used in ((120_000, 130_000), (125_000, 140_000), (90_000, 100_000)):
            with self.subTest(previous=previous, used=used):
                self.assertFalse(
                    await lifecycle.warn_if_near_limit(
                        self.session, self.sub.user_id, "ai_tokens", used, 150_000, NOW, previous=previous
                    )
                )

    async def test_tiny_limits_and_shadow_mode_never_warn(self):
        self.assertFalse(await lifecycle.warn_if_near_limit(self.session, self.sub.user_id, "responses", 3, 4, NOW))
        with patch.object(lifecycle.settings, "BILLING_ENFORCE", False):
            self.assertFalse(
                await lifecycle.warn_if_near_limit(self.session, self.sub.user_id, "ai_actions", 12, 15, NOW)
            )

    async def test_one_warning_per_metric_and_period(self):
        self.has_event.return_value = True

        self.assertFalse(
            await lifecycle.warn_if_near_limit(self.session, self.sub.user_id, "ai_actions", 12, 15, NOW)
        )

        self.add_event.assert_not_awaited()


class ProcessDueTests(WorkerCase):
    async def test_every_step_runs_and_a_failing_one_does_not_stop_the_rest(self):
        with (
            patch.object(lifecycle, "_expire_due", AsyncMock(side_effect=RuntimeError("boom"))),
            patch.object(lifecycle, "_remind_trials", AsyncMock(return_value=2)),
            patch.object(lifecycle, "_remind_expiring", AsyncMock(return_value=3)),
            patch.object(lifecycle, "_send_limit_warnings", AsyncMock(return_value=4)),
            self.assertLogs(lifecycle.logger, level="ERROR"),
        ):
            done = await lifecycle.process_due(self.session, NOW)

        self.assertEqual(dict(done), {"trial_reminders": 2, "expiry_reminders": 3, "limit_warnings": 4})
        self.session.rollback.assert_awaited()


if __name__ == "__main__":
    unittest.main()
