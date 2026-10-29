from __future__ import annotations

import dataclasses
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app import billing_cli
from app.core import metrics
from app.schemas.survey import SubmitSurveyRequest
from app.services import billing_guard, billing_service, survey_demo_service, survey_service
from tests.limited_plans import LIMITED_RESEARCHER as RESEARCHER
from tests.limited_plans import LIMITED_START as START

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
PERIOD_START = NOW - timedelta(days=10)


def ent(plan=START, billing_enabled=True):
    return billing_service.Entitlements(
        plan=plan,
        status="active",
        billing_interval="none",
        period_start=PERIOD_START,
        period_end=NOW + timedelta(days=20),
        trial_ends_at=None,
        trial_used=False,
        cancel_at_period_end=False,
        billing_enabled=billing_enabled,
        ai_window_start=PERIOD_START,
        ai_window_end=NOW + timedelta(days=20),
    )


def survey(owner_id=None):
    return SimpleNamespace(
        id=uuid.uuid4(), organization=SimpleNamespace(owner_user_id=owner_id or uuid.uuid4())
    )


def hits(plan="start", enforced="true") -> float:
    return metrics.BILLING_LIMIT_HIT.labels("responses", plan, enforced)._value.get()


class RegisterResponseTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = MagicMock()
        self.ent = ent()
        self.get_ent = patch.object(
            billing_guard.billing_service,
            "get_entitlements",
            AsyncMock(side_effect=lambda *args, **kwargs: self.ent),
        ).start()
        self.reserve = patch.object(
            billing_guard.billing_repository, "reserve_usage", AsyncMock(return_value=1)
        ).start()
        patch.object(billing_guard.settings, "BILLING_ENABLED", True).start()
        patch.object(billing_guard.settings, "BILLING_ENFORCE", True).start()
        self.addCleanup(patch.stopall)

    async def test_a_response_within_the_quota_is_not_locked(self):
        self.assertFalse(await billing_guard.register_response(self.session, survey()))

    async def test_the_counter_and_the_plan_are_the_survey_owners(self):
        owner = uuid.uuid4()

        await billing_guard.register_response(self.session, survey(owner))

        self.assertEqual(self.get_ent.await_args.args[1], owner)
        args, kwargs = self.reserve.await_args
        self.assertEqual(args[1:4], (owner, "responses", PERIOD_START))

    async def test_the_counter_never_refuses(self):
        await billing_guard.register_response(self.session, survey())

        # No limit on the statement: a respondent must always get "accepted"
        self.assertIsNone(self.reserve.await_args.kwargs["limit"])

    async def test_the_hundred_and_first_response_of_the_free_plan_is_locked(self):
        self.reserve.return_value = 100
        self.assertFalse(await billing_guard.register_response(self.session, survey()))

        self.reserve.return_value = 101
        before = hits()
        self.assertTrue(await billing_guard.register_response(self.session, survey()))
        self.assertEqual(hits() - before, 1)

    async def test_the_paid_plan_has_three_thousand(self):
        self.ent = ent(RESEARCHER)

        self.reserve.return_value = 3_000
        self.assertFalse(await billing_guard.register_response(self.session, survey()))
        self.reserve.return_value = 3_001
        self.assertTrue(await billing_guard.register_response(self.session, survey()))

    async def test_an_admin_override_moves_the_boundary(self):
        self.ent = ent(dataclasses.replace(START, responses_per_period=2))

        self.reserve.return_value = 2
        self.assertFalse(await billing_guard.register_response(self.session, survey()))
        self.reserve.return_value = 3
        self.assertTrue(await billing_guard.register_response(self.session, survey()))

    async def test_shadow_mode_counts_the_overflow_but_locks_nothing(self):
        patch.object(billing_guard.settings, "BILLING_ENFORCE", False).start()
        self.reserve.return_value = 150
        before = hits(enforced="false")

        self.assertFalse(await billing_guard.register_response(self.session, survey()))

        self.reserve.assert_awaited_once()
        self.assertEqual(hits(enforced="false") - before, 1)

    async def test_billing_off_counts_nothing_and_does_not_even_look_at_the_owner(self):
        patch.object(billing_guard.settings, "BILLING_ENABLED", False).start()

        # A survey object without an organization: nothing is read when there is nothing to count
        self.assertFalse(await billing_guard.register_response(self.session, SimpleNamespace()))

        self.get_ent.assert_not_awaited()
        self.reserve.assert_not_awaited()

    async def test_an_owner_without_billing_entitlements_is_not_counted(self):
        self.ent = ent(billing_enabled=False)

        self.assertFalse(await billing_guard.register_response(self.session, survey()))

        self.reserve.assert_not_awaited()


PAGES = [{"fields": [{"id": "q1", "type": "shortText", "label": "Тема", "required": True}]}]


class SubmitWiringTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = MagicMock()
        self.session.commit = AsyncMock()
        self.survey = SimpleNamespace(
            id=uuid.uuid4(),
            status="open",
            closes_at=None,
            pages=PAGES,
            anonymous=True,
            organization=SimpleNamespace(owner_user_id=uuid.uuid4()),
        )
        self.saved = {}

        async def add(session, response):
            self.saved["response"] = response
            response.id = uuid.uuid4()
            return response

        patch.object(
            survey_service.survey_repository, "get_by_token", AsyncMock(return_value=self.survey)
        ).start()
        patch.object(survey_service.survey_repository, "add_response", add).start()
        self.register = patch.object(
            survey_service.billing_guard, "register_response", AsyncMock(return_value=False)
        ).start()
        self.addCleanup(patch.stopall)

    async def submit(self, answers):
        return await survey_service.submit_public_response(
            self.session, "tok", SubmitSurveyRequest(answers=answers, duration_seconds=60)
        )

    async def test_a_response_within_the_quota_is_stored_visible(self):
        result = await self.submit({"q1": "ответ"})

        self.assertFalse(self.saved["response"].locked)
        self.register.assert_awaited_once_with(self.session, self.survey)
        self.session.commit.assert_awaited_once()
        self.assertEqual(result.id, str(self.saved["response"].id))

    async def test_a_response_over_the_quota_is_accepted_and_stored_locked(self):
        self.register.return_value = True

        result = await self.submit({"q1": "ответ"})

        # The respondent gets the same "accepted" answer; the owner will see it with a bigger plan
        self.assertTrue(self.saved["response"].locked)
        self.assertEqual(self.saved["response"].answers, {"q1": "ответ"})
        self.session.commit.assert_awaited_once()
        self.assertEqual(result.id, str(self.saved["response"].id))

    async def test_an_invalid_submission_is_rejected_before_it_is_counted(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.submit({})

        self.assertEqual(ctx.exception.status_code, 422)
        self.register.assert_not_awaited()
        self.session.commit.assert_not_awaited()


class LockedResponsesAreRealDataTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_structure_of_a_survey_with_only_locked_responses_stays_fixed(self):
        survey_obj = SimpleNamespace(id=uuid.uuid4(), pages=PAGES)
        count = AsyncMock(return_value=1)
        with (
            patch.object(survey_service, "_get_for_member", AsyncMock(return_value=survey_obj)),
            patch.object(survey_service.billing_guard, "ensure_questions_within_limit", AsyncMock()),
            patch.object(survey_service.survey_repository, "count_responses", count),
            patch.object(
                survey_service.survey_answers, "structure_conflicts", MagicMock(return_value=["removed"])
            ),
        ):
            payload = SimpleNamespace(pages=[])
            with self.assertRaises(HTTPException) as ctx:
                await survey_service.update_survey(MagicMock(), SimpleNamespace(), "id", payload)

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertTrue(count.await_args.kwargs["include_locked"])

    async def test_demo_answers_never_go_to_a_survey_that_has_locked_ones(self):
        survey_obj = SimpleNamespace(id=uuid.uuid4(), status="open")
        count = AsyncMock(return_value=3)
        with (
            patch.object(survey_demo_service, "_get_for_member", AsyncMock(return_value=survey_obj)),
            patch.object(survey_demo_service.survey_repository, "count_responses", count),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await survey_demo_service.add_demo_responses(MagicMock(), SimpleNamespace(), "id", 10)

        self.assertEqual(ctx.exception.detail, "survey_has_responses")
        self.assertTrue(count.await_args.kwargs["include_locked"])


class UnlockResponsesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = MagicMock()
        self.subscription_id = uuid.uuid4()
        self.unlock = patch.object(
            billing_service.survey_repository, "unlock_responses_for_owner", AsyncMock(return_value=5)
        ).start()
        self.ensure = patch.object(
            billing_service,
            "ensure_subscription",
            AsyncMock(return_value=SimpleNamespace(id=self.subscription_id)),
        ).start()
        self.add_event = patch.object(billing_service.billing_repository, "add_event", AsyncMock()).start()
        self.addCleanup(patch.stopall)

    async def test_the_opened_responses_are_counted_and_the_upgrade_is_journalled(self):
        user_id, admin_id = uuid.uuid4(), uuid.uuid4()

        opened = await billing_service.unlock_responses(self.session, user_id, actor_user_id=admin_id)

        self.assertEqual(opened, 5)
        self.unlock.assert_awaited_once_with(self.session, user_id)
        kwargs = self.add_event.await_args.kwargs
        self.assertEqual(kwargs["subscription_id"], self.subscription_id)
        self.assertEqual(kwargs["kind"], "responses_unlocked")
        self.assertEqual(kwargs["payload"], {"count": 5})
        self.assertEqual(kwargs["actor_user_id"], admin_id)

    async def test_nothing_to_open_leaves_no_trace(self):
        self.unlock.return_value = 0

        self.assertEqual(await billing_service.unlock_responses(self.session, uuid.uuid4()), 0)

        self.ensure.assert_not_awaited()
        self.add_event.assert_not_awaited()


class UnlockCommandTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_operator_opens_the_responses_of_an_account(self):
        account = SimpleNamespace(id=uuid.uuid4(), email="anna@example.com")
        with (
            patch.object(
                billing_cli.user_repository, "get_by_email_ignore_case", AsyncMock(return_value=account)
            ) as lookup,
            patch.object(
                billing_cli.billing_service, "unlock_responses", AsyncMock(return_value=7)
            ) as unlock,
        ):
            user, opened = await billing_cli.unlock_responses(MagicMock(), " Anna@Example.com ")

        self.assertEqual((user, opened), (account, 7))
        self.assertEqual(lookup.await_args.args[1], "Anna@Example.com")
        self.assertEqual(unlock.await_args.args[1], account.id)

    async def test_an_unknown_address_is_an_error(self):
        with patch.object(
            billing_cli.user_repository, "get_by_email_ignore_case", AsyncMock(return_value=None)
        ):
            with self.assertRaises(billing_cli.CliError):
                await billing_cli.unlock_responses(MagicMock(), "nobody@example.com")

    def test_the_command_commits_and_reports_the_number(self):
        account = SimpleNamespace(id=uuid.uuid4(), email="anna@example.com")
        session = MagicMock()
        session.commit = AsyncMock()
        factory = MagicMock()
        factory.return_value.__aenter__ = AsyncMock(return_value=session)
        factory.return_value.__aexit__ = AsyncMock(return_value=False)
        with (
            patch.object(billing_cli, "async_session_factory", factory),
            patch.object(billing_cli, "engine", MagicMock(dispose=AsyncMock())),
            patch.object(billing_cli, "unlock_responses", AsyncMock(return_value=(account, 7))),
            patch("builtins.print") as printed,
        ):
            code = billing_cli.main(["unlock-responses", "anna@example.com"])

        self.assertEqual(code, 0)
        session.commit.assert_awaited_once()
        self.assertIn("открыто ответов — 7", printed.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
