"""The team pool of Токены+: whose counter an AI action is charged to, the personal cap, the weight."""

from __future__ import annotations

import dataclasses
import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.constants.billing_plans import RESEARCHER, START
from app.schemas.organization import UpdateMemberAiLimitRequest
from app.services import ai_meter, ai_pool, organization_service
from tests import test_ai_meter as base

ORG_ID = uuid.uuid4()
# The model the test helper `llm()` reports
BASE_MODEL = "z-ai/glm-5.3-flash"


def fifth(plan=RESEARCHER):
    """A plan whose base model counts a fifth, as it will after stage 2."""
    return dataclasses.replace(plan, base_model_weight=0.2)


class ChargedTokensTests(unittest.TestCase):
    def setUp(self):
        patch.object(ai_pool.settings, "OPENROUTER_MODEL", BASE_MODEL).start()
        self.addCleanup(patch.stopall)

    def test_a_token_of_another_model_costs_one(self):
        self.assertEqual(ai_pool.charged_tokens(1000, "z-ai/glm-5.3", fifth()), 1000)

    def test_a_token_of_the_base_model_costs_the_weight_of_the_plan(self):
        self.assertEqual(ai_pool.charged_tokens(1000, BASE_MODEL, fifth()), 200)

    def test_an_unknown_model_counts_as_the_base_one(self):
        self.assertEqual(ai_pool.charged_tokens(1000, None, fifth()), 200)

    def test_five_tokens_at_a_fifth_are_one_not_two(self):
        self.assertEqual(ai_pool.charged_tokens(5, None, fifth()), 1)

    def test_a_started_action_costs_at_least_one(self):
        self.assertEqual(ai_pool.charged_tokens(1, None, fifth()), 1)

    def test_nothing_used_costs_nothing(self):
        self.assertEqual(ai_pool.charged_tokens(0, None, RESEARCHER), 0)

    def test_every_current_plan_counts_one_to_one(self):
        # The weight of 0.2 goes in with the new quotas; until then the allowances do not change
        self.assertEqual(ai_pool.charged_tokens(150, BASE_MODEL, START), 150)
        self.assertEqual(ai_pool.charged_tokens(150, BASE_MODEL, RESEARCHER), 150)


class MemberMetricTests(unittest.TestCase):
    def test_it_fits_the_column_and_differs_per_team(self):
        first, second = ai_pool.member_metric(uuid.uuid4()), ai_pool.member_metric(uuid.uuid4())
        self.assertLessEqual(len(first), 32)
        self.assertNotEqual(first, second)
        self.assertNotEqual(first, "ai_tokens")


class PoolCase(base.MeterCase):
    """MeterCase plus a team: an owner on a paid plan, and the acting member."""

    def setUp(self):
        super().setUp()
        patch.object(ai_pool.settings, "OPENROUTER_MODEL", BASE_MODEL).start()
        self.owner = base.user()
        self.org = SimpleNamespace(id=ORG_ID, owner_user_id=self.owner.id, is_personal=False)
        self.member = SimpleNamespace(role_tag="editor", token_plus_limit=None)
        self.get_org = patch.object(
            ai_pool.organization_repository, "get_org_by_id", AsyncMock(return_value=self.org)
        ).start()
        self.get_member = patch.object(
            ai_pool.organization_repository, "get_member", AsyncMock(return_value=self.member)
        ).start()
        self.entitlements.return_value = base.ent(RESEARCHER)
        self.usage = {}

        async def usage_of(session, user_id, start):
            return self.usage.get(user_id, {})

        self.get_usage.side_effect = usage_of

    async def run_team(self, body=None, who=None):
        async with ai_meter.action(
            who or self.user, "ai_chat", survey_id=base.SURVEY_ID, organization_id=ORG_ID
        ) as collector:
            if body is not None:
                await body(collector)


class PayerTests(PoolCase):
    async def test_an_editor_of_a_paid_team_is_charged_to_the_pool_of_the_owner(self):
        await self.run_team(self.llm_body)

        args = self.add_usage.await_args.args
        self.assertEqual(args[1:3], (self.owner.id, "ai_tokens"))
        self.assertEqual(args[4], 150)
        kwargs = self.add_log.await_args.kwargs
        # The log keeps who did it, and for which team
        self.assertEqual(kwargs["user_id"], self.user.id)
        self.assertEqual(kwargs["organization_id"], ORG_ID)

    async def test_the_owner_pays_from_their_own_counter(self):
        await self.run_team(self.llm_body, who=self.owner)

        self.assertEqual(self.add_usage.await_args.args[1], self.owner.id)
        self.assertEqual(self.add_usage.await_count, 1)

    async def test_a_team_of_a_free_owner_spends_the_personal_allowance(self):
        self.entitlements.return_value = base.ent(START)

        await self.run_team(self.llm_body)

        self.assertEqual(self.add_usage.await_args.args[1], self.user.id)

    async def test_a_personal_workspace_spends_the_personal_counter(self):
        self.org.is_personal = True

        await self.run_team(self.llm_body)

        self.assertEqual(self.add_usage.await_args.args[1], self.user.id)

    async def test_with_billing_off_the_actor_stays_the_payer(self):
        self.entitlements.return_value = base.ent(RESEARCHER, billing_enabled=False)

        await self.run_team(self.llm_body)

        self.add_usage.assert_not_awaited()
        self.assertEqual(self.add_log.await_args.kwargs["user_id"], self.user.id)

    async def test_without_a_team_nothing_changes(self):
        await self.run_action(self.llm_body)

        self.assertEqual(self.add_usage.await_args.args[1], self.user.id)
        self.get_org.assert_not_awaited()

    async def test_a_reader_has_no_ai_and_the_llm_is_not_called(self):
        self.member.role_tag = "reader"
        ran = []

        async def body(_):
            ran.append(True)

        with self.assertRaises(HTTPException) as ctx:
            await self.run_team(body)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail["code"], "ai_forbidden_for_reader")
        self.assertEqual(ran, [])
        self.add_usage.assert_not_awaited()

    async def test_the_reader_is_refused_even_with_billing_off(self):
        self.entitlements.return_value = base.ent(RESEARCHER, billing_enabled=False)
        self.member.role_tag = "reader"

        with self.assertRaises(HTTPException) as ctx:
            await self.run_team(self.llm_body)

        self.assertEqual(ctx.exception.detail["code"], "ai_forbidden_for_reader")

    async def test_the_old_member_tag_is_an_editor(self):
        self.member.role_tag = "member"

        await self.run_team(self.llm_body)

        self.assertEqual(self.add_usage.await_args.args[1], self.owner.id)

    async def test_a_stranger_is_refused(self):
        self.get_member.return_value = None

        with self.assertRaises(HTTPException) as ctx:
            await self.run_team(self.llm_body)

        self.assertEqual(ctx.exception.status_code, 403)
        self.add_usage.assert_not_awaited()


class PoolLimitTests(PoolCase):
    async def test_a_used_up_pool_stops_every_member(self):
        self.usage[self.owner.id] = {"ai_tokens": RESEARCHER.ai_tokens_per_period}

        with self.assertRaises(HTTPException) as ctx:
            await self.run_team(self.llm_body)

        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(ctx.exception.detail["limit"], "ai_tokens")
        self.add_usage.assert_not_awaited()

    async def test_the_pool_is_not_the_members_own_counter(self):
        # The member's own counter is full, the pool is not: the action runs
        self.usage[self.user.id] = {"ai_tokens": 10**9}

        await self.run_team(self.llm_body)

        self.assertEqual(self.add_usage.await_args.args[1], self.owner.id)


class PersonalCapTests(PoolCase):
    def setUp(self):
        super().setUp()
        self.member.token_plus_limit = 1_000
        self.metric = ai_pool.member_metric(ORG_ID)

    async def test_the_cap_is_charged_next_to_the_pool(self):
        await self.run_team(self.llm_body)

        self.assertEqual(self.add_usage.await_count, 2)
        pool_call, cap_call = self.add_usage.await_args_list
        self.assertEqual(pool_call.args[1:3], (self.owner.id, "ai_tokens"))
        self.assertEqual(cap_call.args[1:3], (self.user.id, self.metric))
        self.assertEqual(cap_call.args[4], 150)

    async def test_a_member_over_the_cap_is_stopped_but_the_pool_stays(self):
        self.usage[self.user.id] = {self.metric: 1_000}

        with self.assertRaises(HTTPException) as ctx:
            await self.run_team(self.llm_body)

        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(ctx.exception.detail["limit"], "ai_member_tokens")
        self.assertEqual(ctx.exception.detail["max"], 1_000)
        self.add_usage.assert_not_awaited()

    async def test_a_member_under_the_cap_works(self):
        self.usage[self.user.id] = {self.metric: 999}

        await self.run_team(self.llm_body)

        self.assertEqual(self.add_usage.await_count, 2)

    async def test_a_member_without_a_cap_is_not_counted_separately(self):
        self.member.token_plus_limit = None
        self.usage[self.user.id] = {self.metric: 10**9}

        await self.run_team(self.llm_body)

        self.assertEqual(self.add_usage.await_count, 1)

    async def test_shadow_mode_counts_the_cap_but_lets_it_through(self):
        patch.object(ai_meter.settings, "BILLING_ENFORCE", False).start()
        self.usage[self.user.id] = {self.metric: 5_000}

        await self.run_team(self.llm_body)

        self.assertEqual(self.add_usage.await_count, 2)

    async def test_a_zero_cap_means_no_ai_for_that_member(self):
        self.member.token_plus_limit = 0

        with self.assertRaises(HTTPException) as ctx:
            await self.run_team(self.llm_body)

        self.assertEqual(ctx.exception.detail["limit"], "ai_member_tokens")

    async def test_the_owner_has_no_cap_even_if_a_row_says_so(self):
        await self.run_team(self.llm_body, who=self.owner)

        self.assertEqual(self.add_usage.await_count, 1)


class WeightTests(PoolCase):
    async def test_the_counter_gets_the_weighted_amount_and_the_log_both(self):
        self.entitlements.return_value = base.ent(fifth())

        await self.run_team(self.llm_body)

        # 150 real tokens of the base model at a fifth
        self.assertEqual(self.add_usage.await_args.args[4], 30)
        kwargs = self.add_log.await_args.kwargs
        self.assertEqual(kwargs["charged_tokens"], 30)
        self.assertEqual(kwargs["prompt_tokens"] + kwargs["completion_tokens"], 150)

    async def test_the_cap_gets_the_same_weighted_amount(self):
        self.entitlements.return_value = base.ent(fifth())
        self.member.token_plus_limit = 1_000

        await self.run_team(self.llm_body)

        self.assertEqual([c.args[4] for c in self.add_usage.await_args_list], [30, 30])

    async def test_a_failed_action_is_not_charged_but_stays_in_the_log(self):
        async def body(_):
            base.llm()
            raise RuntimeError("boom")

        with self.assertRaises(RuntimeError):
            await self.run_team(body)

        self.add_usage.assert_not_awaited()
        kwargs = self.add_log.await_args.kwargs
        self.assertIsNone(kwargs["charged_tokens"])
        self.assertEqual(kwargs["organization_id"], ORG_ID)


class MemberAiLimitTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.owner = SimpleNamespace(id=uuid.uuid4())
        self.admin = SimpleNamespace(id=uuid.uuid4())
        self.editor_id = uuid.uuid4()
        self.reader_id = uuid.uuid4()
        self.org = SimpleNamespace(id=ORG_ID, owner_user_id=self.owner.id)
        self.members = {
            self.admin.id: SimpleNamespace(role_tag="admin", user_id=self.admin.id),
            self.editor_id: SimpleNamespace(role_tag="editor", user_id=self.editor_id),
            self.reader_id: SimpleNamespace(role_tag="reader", user_id=self.reader_id),
            self.owner.id: SimpleNamespace(role_tag="owner", user_id=self.owner.id),
        }
        for member in self.members.values():
            member.user = SimpleNamespace(
                id=member.user_id, first_name="A", last_name="B", middle_name=None, email="a@b.c"
            )
            member.id = uuid.uuid4()
            member.joined_at = datetime.now(timezone.utc)
            member.job_title = member.specialization = None
            member.token_plus_limit = None

        async def get_member(session, org_id, user_id):
            return self.members.get(user_id)

        patch.object(organization_service, "_get_org_or_404", AsyncMock(return_value=self.org)).start()
        patch.object(
            organization_service.organization_repository, "get_member", AsyncMock(side_effect=get_member)
        ).start()
        self.session = SimpleNamespace(flush=AsyncMock(), refresh=AsyncMock(), commit=AsyncMock())
        self.addCleanup(patch.stopall)

    async def set_limit(self, target, value, caller=None):
        return await organization_service.update_member_ai_limit(
            self.session,
            ORG_ID,
            target,
            UpdateMemberAiLimitRequest(token_plus_limit=value),
            caller or self.owner,
        )

    async def test_the_owner_caps_an_editor(self):
        result = await self.set_limit(self.editor_id, 500_000)

        self.assertEqual(result.token_plus_limit, 500_000)
        self.assertEqual(self.members[self.editor_id].token_plus_limit, 500_000)
        self.session.commit.assert_awaited_once()

    async def test_an_admin_may_cap_an_editor_too(self):
        result = await self.set_limit(self.editor_id, 1, caller=self.admin)

        self.assertEqual(result.token_plus_limit, 1)

    async def test_the_cap_is_lifted_with_none(self):
        self.members[self.editor_id].token_plus_limit = 10

        result = await self.set_limit(self.editor_id, None)

        self.assertIsNone(result.token_plus_limit)

    async def test_an_editor_cannot_set_caps(self):
        editor = SimpleNamespace(id=self.editor_id)

        with self.assertRaises(HTTPException) as ctx:
            await self.set_limit(self.editor_id, 10, caller=editor)

        self.assertEqual(ctx.exception.status_code, 403)
        self.session.commit.assert_not_awaited()

    async def test_the_owner_spends_without_a_cap(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.set_limit(self.owner.id, 10)

        self.assertEqual(ctx.exception.status_code, 400)

    async def test_a_reader_has_no_ai_to_cap(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.set_limit(self.reader_id, 10)

        self.assertEqual(ctx.exception.status_code, 400)

    async def test_an_unknown_member_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.set_limit(uuid.uuid4(), 10)

        self.assertEqual(ctx.exception.status_code, 404)

    def test_a_negative_cap_is_not_accepted(self):
        with self.assertRaises(ValueError):
            UpdateMemberAiLimitRequest(token_plus_limit=-1)


if __name__ == "__main__":
    unittest.main()
