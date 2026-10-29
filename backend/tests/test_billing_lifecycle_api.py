from __future__ import annotations

import contextlib
import io
import json
import unittest
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app import billing_cli, worker
from app.api.routes import auth as auth_routes
from app.api.routes import billing as billing_routes
from app.schemas.auth import DeleteAccountRequest
from app.services import (
    account_deletion_service,
    ops_alert_service,
    payment_service,
    subscription_lifecycle_service,
)
from app.services.account_deletion_service import DeletionOutcome

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
FAR = datetime(2099, 1, 1, tzinfo=timezone.utc)
DAY = timedelta(days=1)


class BillingRoutesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = MagicMock()
        self.session.commit = AsyncMock()
        self.user = SimpleNamespace(id=uuid.uuid4())
        self.lifecycle = {
            name: patch.object(billing_routes.lifecycle, name, AsyncMock()).start()
            for name in ("start_trial", "cancel", "resume")
        }
        patch.object(
            billing_routes.billing_service, "get_subscription_summary", AsyncMock(return_value="summary")
        ).start()
        patch.object(billing_routes.settings, "BILLING_ENABLED", True).start()
        self.addCleanup(patch.stopall)

    async def test_the_trial_is_started_for_the_current_person_and_committed(self):
        result = await billing_routes.start_trial(self.session, self.user)

        self.assertEqual(result, "summary")
        self.lifecycle["start_trial"].assert_awaited_once_with(self.session, self.user)
        self.session.commit.assert_awaited_once()

    async def test_cancel_and_resume_act_on_the_current_person(self):
        await billing_routes.cancel_subscription(self.session, self.user)
        await billing_routes.resume_subscription(self.session, self.user)

        self.lifecycle["cancel"].assert_awaited_once_with(self.session, self.user.id)
        self.lifecycle["resume"].assert_awaited_once_with(self.session, self.user)

    async def test_with_billing_off_these_actions_are_unavailable(self):
        patch.object(billing_routes.settings, "BILLING_ENABLED", False).start()
        for action in (
            billing_routes.start_trial,
            billing_routes.cancel_subscription,
            billing_routes.resume_subscription,
        ):
            with self.subTest(action=action.__name__):
                with self.assertRaises(HTTPException) as ctx:
                    await action(self.session, self.user)
                self.assertEqual(ctx.exception.status_code, 409)
                self.assertEqual(ctx.exception.detail, {"code": "billing_disabled"})

        self.lifecycle["start_trial"].assert_not_awaited()


class DeleteAccountRoutesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user = SimpleNamespace(id=uuid.uuid4())
        self.payload = DeleteAccountRequest(password="x", defer_until_subscription_ends=True)
        self.delete = patch.object(
            auth_routes.account_deletion_service, "delete_account", AsyncMock()
        ).start()
        self.cancel = patch.object(
            auth_routes.account_deletion_service, "cancel_scheduled_deletion", AsyncMock()
        ).start()
        self.addCleanup(patch.stopall)

    async def test_a_deleted_account_answers_204_without_a_body(self):
        self.delete.return_value = DeletionOutcome(deleted=True)

        response = await auth_routes.delete_my_account(self.payload, self.user, MagicMock())

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.body, b"")

    async def test_a_scheduled_deletion_answers_202_with_the_date(self):
        self.delete.return_value = DeletionOutcome(deleted=False, delete_at=NOW + 10 * DAY)

        response = await auth_routes.delete_my_account(self.payload, self.user, MagicMock())

        self.assertEqual(response.status_code, 202)
        self.assertEqual(
            json.loads(response.body),
            {"status": "scheduled", "delete_at": (NOW + 10 * DAY).isoformat()},
        )

    async def test_cancelling_a_scheduled_deletion_answers_204(self):
        session = MagicMock()

        response = await auth_routes.cancel_my_account_deletion(self.user, session)

        self.assertEqual(response.status_code, 204)
        self.cancel.assert_awaited_once_with(session, self.user)

    def test_the_request_defaults_to_deleting_at_once(self):
        self.assertFalse(DeleteAccountRequest(password="x").defer_until_subscription_ends)


class WorkerTickTests(unittest.IsolatedAsyncioTestCase):
    async def test_every_step_gets_its_own_session_and_a_failure_does_not_stop_the_rest(self):
        failing, working = AsyncMock(side_effect=RuntimeError("boom")), AsyncMock(return_value={"deleted": 1})
        sessions = []

        @asynccontextmanager
        async def factory():
            session = MagicMock()
            sessions.append(session)
            yield session

        steps = (("first", failing), ("second", working))
        with (
            patch.object(worker, "_BILLING_STEPS", steps),
            patch.object(worker, "async_session_factory", factory),
            self.assertLogs("svod.worker", level="ERROR"),
        ):
            await worker.run_billing_tick()

        self.assertEqual(len(sessions), 2)
        working.assert_awaited_once_with(sessions[1])

    def test_the_tick_settles_payments_first_and_then_does_the_lifecycle(self):
        self.assertEqual(
            [step for _, step in worker._BILLING_STEPS],
            [
                payment_service.reconcile_open,
                ops_alert_service.run,
                subscription_lifecycle_service.process_due,
                account_deletion_service.process_scheduled_deletions,
                account_deletion_service.send_deletion_reminders,
            ],
        )


def paid(**overrides):
    data = dict(
        id=uuid.uuid4(),
        plan_code="researcher",
        status="active",
        billing_interval="one_off",
        current_period_start=NOW,
        current_period_end=FAR,
        trial_ends_at=None,
        trial_used_at=None,
        cancel_at_period_end=False,
        limit_overrides=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


class GrantCommandTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.account = SimpleNamespace(id=uuid.uuid4(), email="anna@example.com")
        self.lookup = patch.object(
            billing_cli.user_repository, "get_by_email_ignore_case", AsyncMock(return_value=self.account)
        ).start()
        self.grant = patch.object(billing_cli.lifecycle, "grant", AsyncMock(return_value=paid())).start()
        self.addCleanup(patch.stopall)

    async def test_the_plan_is_granted_to_the_account(self):
        until = NOW + 30 * DAY

        user, sub = await billing_cli.grant_plan(
            MagicMock(), "anna@example.com", "researcher", days=None, until=until, note="счёт 7"
        )

        self.assertIs(user, self.account)
        args, kwargs = self.grant.await_args
        self.assertEqual(args[1:3], (self.account.id, "researcher"))
        self.assertEqual((kwargs["days"], kwargs["until"], kwargs["note"]), (None, until, "счёт 7"))

    async def test_a_refused_grant_is_shown_as_an_operator_error(self):
        self.grant.side_effect = ValueError("Дата окончания уже в прошлом")

        with self.assertRaises(billing_cli.CliError) as ctx:
            await billing_cli.grant_plan(MagicMock(), "a@b.c", "researcher", days=1, until=None, note=None)

        self.assertIn("в прошлом", str(ctx.exception))

    async def test_an_unknown_address_is_an_error(self):
        self.lookup.return_value = None

        with self.assertRaises(billing_cli.CliError):
            await billing_cli.grant_plan(MagicMock(), "nobody@b.c", "researcher", days=1, until=None, note=None)

        self.grant.assert_not_awaited()


class BetaCommandTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.until = NOW + 60 * DAY
        self.ids = [uuid.uuid4() for _ in range(3)]
        patch.object(
            billing_cli.user_repository, "list_active_ids", AsyncMock(side_effect=[self.ids, []])
        ).start()
        states = {
            self.ids[0]: paid(current_period_end=self.until + DAY),  # already covered
            self.ids[1]: paid(plan_code="start", billing_interval="none"),
            self.ids[2]: None,
        }
        patch.object(
            billing_cli.billing_repository,
            "get_subscription",
            AsyncMock(side_effect=lambda session, user_id: states[user_id]),
        ).start()
        self.grant = patch.object(billing_cli.lifecycle, "grant", AsyncMock()).start()
        self.session = MagicMock()
        self.session.commit = AsyncMock()
        self.addCleanup(patch.stopall)

    async def test_everyone_gets_the_plan_except_those_who_already_have_it_for_long_enough(self):
        granted, skipped = await billing_cli.grant_beta(self.session, self.until)

        self.assertEqual((granted, skipped), (2, 1))
        self.assertEqual(
            [call.args[1] for call in self.grant.await_args_list], [self.ids[1], self.ids[2]]
        )
        self.assertEqual(self.grant.await_args.kwargs, {"until": self.until, "note": "beta"})
        self.session.commit.assert_awaited_once()

    async def test_a_dry_run_only_counts(self):
        granted, skipped = await billing_cli.grant_beta(self.session, self.until, dry_run=True)

        self.assertEqual((granted, skipped), (2, 1))
        self.grant.assert_not_awaited()
        self.session.commit.assert_not_awaited()


class ShowCommandTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.account = SimpleNamespace(
            id=uuid.uuid4(),
            email="anna@example.com",
            full_name="Иванова Анна",
            role="user",
            is_active=True,
            email_verified_at=NOW,
            ai_enabled=True,
            deletion_requested_at=None,
        )
        patch.object(
            billing_cli.user_repository, "get_by_email_ignore_case", AsyncMock(return_value=self.account)
        ).start()
        self.subscription = patch.object(
            billing_cli.billing_repository,
            "get_subscription",
            AsyncMock(return_value=paid(cancel_at_period_end=True, limit_overrides={"max_projects": 7})),
        ).start()
        patch.object(
            billing_cli.billing_repository,
            "get_usage",
            AsyncMock(return_value={"ai_tokens": 4000, "responses": 105}),
        ).start()
        patch.object(
            billing_cli.survey_repository, "count_locked_for_owner", AsyncMock(return_value=5)
        ).start()
        patch.object(
            billing_cli.billing_repository,
            "list_events",
            AsyncMock(
                return_value=[SimpleNamespace(created_at=NOW, kind="manual_grant", payload={"note": "счёт 7"})]
            ),
        ).start()
        self.addCleanup(patch.stopall)

    async def test_it_describes_the_account_plan_usage_and_history(self):
        text = await billing_cli.show_user(MagicMock(), "anna@example.com")

        for expected in (
            "anna@example.com — Иванова Анна",
            "ИИ включён",
            "Удаление: нет",
            "действует «Исследователь»",
            "продление отключено",
            "Пробный период: не использован",
            "{'max_projects': 7}",
            "токенов ИИ 4000 из 6000000; ответов в периоде 105; скрытых ответов 5",
            "manual_grant",
            "счёт 7",
        ):
            self.assertIn(expected, text)

    async def test_an_account_without_a_subscription_is_on_the_free_plan(self):
        self.subscription.return_value = None

        text = await billing_cli.show_user(MagicMock(), "anna@example.com")

        self.assertIn("Подписки ещё нет", text)

    async def test_a_scheduled_deletion_is_shown(self):
        self.account.deletion_requested_at = NOW

        text = await billing_cli.show_user(MagicMock(), "anna@example.com")

        self.assertIn("Удаление: запланировано", text)


class CommandLineTests(unittest.TestCase):
    def test_a_date_means_the_end_of_that_day(self):
        self.assertEqual(
            billing_cli._end_of_day("2026-12-15"), datetime(2026, 12, 15, 23, 59, 59, tzinfo=timezone.utc)
        )

    def test_a_bad_date_is_refused(self):
        with self.assertRaises(Exception) as ctx:
            billing_cli._end_of_day("15.12.2026")
        self.assertIn("ГГГГ-ММ-ДД", str(ctx.exception))

    def test_the_grant_command_commits_and_reports_the_plan(self):
        account = SimpleNamespace(id=uuid.uuid4(), email="anna@example.com")
        session = MagicMock()
        session.commit = AsyncMock()
        factory = MagicMock()
        factory.return_value.__aenter__ = AsyncMock(return_value=session)
        factory.return_value.__aexit__ = AsyncMock(return_value=False)
        with (
            patch.object(billing_cli, "async_session_factory", factory),
            patch.object(billing_cli, "engine", MagicMock(dispose=AsyncMock())),
            patch.object(billing_cli, "grant_plan", AsyncMock(return_value=(account, paid()))) as grant,
            patch("builtins.print") as printed,
        ):
            code = billing_cli.main(["grant", "anna@example.com", "--days", "30", "--note", "счёт 7"])

        self.assertEqual(code, 0)
        session.commit.assert_awaited_once()
        self.assertEqual((grant.await_args.kwargs["days"], grant.await_args.kwargs["note"]), (30, "счёт 7"))
        self.assertIn("«Исследователь»", printed.call_args.args[0])

    def test_a_term_is_required_and_only_one_kind_is_allowed(self):
        for argv in (
            ["grant", "anna@example.com"],
            ["grant", "anna@example.com", "--days", "3", "--until", "2026-12-01"],
        ):
            with self.subTest(argv=argv):
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as ctx:
                    billing_cli.main(argv)
                self.assertEqual(ctx.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
