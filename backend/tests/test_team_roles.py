"""Roles of a team (owner / admin / editor / reader) and its seats."""

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.constants import team_roles
from app.constants.billing_plans import RESEARCHER, START
from app.schemas.organization import UpdateRoleRequest
from app.services import billing_service, organization_service, survey_service, team_seat_service
from app.services.team_seat_service import SeatUsage


class RoleRulesTests(unittest.TestCase):
    def test_legacy_member_is_an_editor(self):
        self.assertEqual(team_roles.normalize_role("member"), team_roles.ROLE_EDITOR)

    def test_unknown_or_missing_role_is_the_weakest(self):
        for tag in (None, "", "root", "OWNER"):
            self.assertEqual(team_roles.normalize_role(tag), team_roles.ROLE_READER)
            self.assertFalse(team_roles.can_edit(tag))

    def test_who_may_edit(self):
        self.assertTrue(team_roles.can_edit("owner"))
        self.assertTrue(team_roles.can_edit("admin"))
        self.assertTrue(team_roles.can_edit("editor"))
        self.assertTrue(team_roles.can_edit("member"))
        self.assertFalse(team_roles.can_edit("reader"))

    def test_who_may_manage_members_and_billing(self):
        self.assertTrue(team_roles.can_manage_members("owner"))
        self.assertTrue(team_roles.can_manage_members("admin"))
        self.assertFalse(team_roles.can_manage_members("editor"))
        self.assertFalse(team_roles.can_manage_members("reader"))
        self.assertTrue(team_roles.can_manage_billing("owner"))
        self.assertFalse(team_roles.can_manage_billing("admin"))

    def test_only_the_reader_takes_no_seat(self):
        self.assertTrue(all(team_roles.takes_seat(r) for r in ("owner", "admin", "editor", "member")))
        self.assertFalse(team_roles.takes_seat("reader"))

    def test_assignable_roles_never_include_the_owner(self):
        self.assertIsNone(team_roles.parse_assignable_role("owner"))
        self.assertIsNone(team_roles.parse_assignable_role("superuser"))
        self.assertEqual(team_roles.parse_assignable_role("member"), team_roles.ROLE_EDITOR)
        self.assertEqual(team_roles.parse_assignable_role("reader"), team_roles.ROLE_READER)


class SeatRulesTests(unittest.TestCase):
    def test_count_roles_splits_seats_and_readers(self):
        self.assertEqual(
            team_seat_service.count_roles(["owner", "editor", "member", "reader", "reader"]), (3, 2)
        )

    def test_a_full_team_blocks_a_seat_but_not_a_reader(self):
        usage = SeatUsage(seats_used=3, readers=0, seats_limit=3)
        self.assertEqual(team_seat_service.blocking_limit(usage, "editor"), "seats")
        self.assertEqual(team_seat_service.blocking_limit(usage, "admin"), "seats")
        self.assertIsNone(team_seat_service.blocking_limit(usage, "reader"))

    def test_readers_are_capped(self):
        usage = SeatUsage(seats_used=1, readers=team_roles.MAX_READERS_PER_TEAM, seats_limit=3)
        self.assertEqual(team_seat_service.blocking_limit(usage, "reader"), "readers")
        self.assertIsNone(team_seat_service.blocking_limit(usage, "editor"))

    def test_taking_a_person_out_frees_their_place(self):
        usage = SeatUsage(seats_used=3, readers=2, seats_limit=3)
        self.assertEqual(team_seat_service.without_role(usage, "editor").seats_used, 2)
        self.assertEqual(team_seat_service.without_role(usage, "reader").readers, 1)
        self.assertEqual(team_seat_service.without_role(SeatUsage(0, 0, 1), "editor").seats_used, 0)


def _entitlements(plan, *, seats, enabled=True):
    now = datetime.now(timezone.utc)
    return billing_service.Entitlements(
        plan=plan,
        status="active",
        billing_interval="month",
        period_start=now,
        period_end=now + timedelta(days=30),
        trial_ends_at=None,
        trial_used=False,
        cancel_at_period_end=False,
        billing_enabled=enabled,
        ai_window_start=now,
        ai_window_end=None,
        seats=seats,
    )


class EnsureRoomTests(unittest.IsolatedAsyncioTestCase):
    """The seat rule follows the same switches as every plan limit."""

    def _patch(self, *, usage, ent, enforced):
        patch.object(
            team_seat_service, "usage_for_org", AsyncMock(return_value=(usage, ent))
        ).start()
        patch.object(team_seat_service.settings, "BILLING_ENFORCE", enforced).start()
        self.addCleanup(patch.stopall)

    async def test_enforced_full_team_refuses_with_402(self):
        self._patch(
            usage=SeatUsage(3, 0, 3), ent=_entitlements(RESEARCHER, seats=3), enforced=True
        )
        with self.assertRaises(HTTPException) as ctx:
            await team_seat_service.ensure_room(None, SimpleNamespace(), "editor")
        self.assertEqual(ctx.exception.status_code, 402)
        self.assertEqual(ctx.exception.detail["code"], "limit_reached")
        self.assertEqual(ctx.exception.detail["limit"], "seats")
        self.assertEqual((ctx.exception.detail["used"], ctx.exception.detail["max"]), (3, 3))

    async def test_shadow_mode_lets_it_through(self):
        self._patch(
            usage=SeatUsage(3, 0, 3), ent=_entitlements(RESEARCHER, seats=3), enforced=False
        )
        await team_seat_service.ensure_room(None, SimpleNamespace(), "editor")

    async def test_billing_off_checks_nothing(self):
        self._patch(
            usage=SeatUsage(9, 0, 1),
            ent=_entitlements(START, seats=1, enabled=False),
            enforced=True,
        )
        await team_seat_service.ensure_room(None, SimpleNamespace(), "editor")

    async def test_free_team_is_the_creator_only(self):
        self._patch(usage=SeatUsage(1, 0, 1), ent=_entitlements(START, seats=1), enforced=True)
        with self.assertRaises(HTTPException) as ctx:
            await team_seat_service.ensure_room(None, SimpleNamespace(), "editor")
        self.assertEqual(ctx.exception.detail["limit"], "seats")

    async def test_a_reader_fits_into_a_full_team(self):
        self._patch(
            usage=SeatUsage(3, 0, 3), ent=_entitlements(RESEARCHER, seats=3), enforced=True
        )
        await team_seat_service.ensure_room(None, SimpleNamespace(), "reader")

    async def test_changing_role_does_not_count_the_person_twice(self):
        # Three seats, three taken: an editor made an admin stays within the same seat
        self._patch(
            usage=SeatUsage(3, 0, 3), ent=_entitlements(RESEARCHER, seats=3), enforced=True
        )
        await team_seat_service.ensure_room(
            None, SimpleNamespace(), "admin", replacing_role="editor"
        )

    async def test_accepting_an_invitation_does_not_count_against_itself(self):
        self._patch(
            usage=SeatUsage(3, 0, 3), ent=_entitlements(RESEARCHER, seats=3), enforced=True
        )
        await team_seat_service.ensure_room(
            None, SimpleNamespace(), "editor", already_counted=True
        )

    async def test_a_reader_made_an_editor_needs_a_free_seat(self):
        self._patch(
            usage=SeatUsage(3, 1, 3), ent=_entitlements(RESEARCHER, seats=3), enforced=True
        )
        with self.assertRaises(HTTPException) as ctx:
            await team_seat_service.ensure_room(
                None, SimpleNamespace(), "editor", replacing_role="reader"
            )
        self.assertEqual(ctx.exception.status_code, 402)


class SharedSeatsTests(unittest.IsolatedAsyncioTestCase):
    """The seats are the owner's: shared by every team the owner has in one service."""

    def setUp(self):
        self.owner = uuid.uuid4()
        self.anna, self.boris, self.vera = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        self.team_a = SimpleNamespace(id=uuid.uuid4(), owner_user_id=self.owner, service="surveys")
        self.team_b = SimpleNamespace(id=uuid.uuid4(), owner_user_id=self.owner, service="surveys")
        member = lambda user_id, role: SimpleNamespace(user_id=user_id, role_tag=role)  # noqa: E731
        self.members = {
            self.team_a.id: [member(self.owner, "owner"), member(self.anna, "editor"), member(self.vera, "reader")],
            self.team_b.id: [member(self.owner, "owner"), member(self.anna, "admin"), member(self.boris, "editor")],
        }
        self.invitations = {
            self.team_a.id: [
                SimpleNamespace(status="pending", role_tag="editor", invited_user_id=None, email="New@Example.com"),
                SimpleNamespace(status="accepted", role_tag="editor", invited_user_id=None, email="old@example.com"),
            ],
            self.team_b.id: [],
        }
        repo = team_seat_service.organization_repository
        patch.object(
            repo, "list_owned_teams", AsyncMock(return_value=[self.team_a, self.team_b])
        ).start()
        patch.object(repo, "list_members", AsyncMock(side_effect=lambda s, org_id: self.members[org_id])).start()
        patch.object(
            repo, "list_invitations", AsyncMock(side_effect=lambda s, org_id: self.invitations[org_id])
        ).start()
        patch.object(
            team_seat_service.billing_service,
            "get_entitlements",
            AsyncMock(return_value=_entitlements(RESEARCHER, seats=4)),
        ).start()
        patch.object(team_seat_service.settings, "BILLING_ENFORCE", True).start()
        self.addCleanup(patch.stopall)

    async def test_a_person_in_two_teams_takes_one_seat(self):
        usage, _ = await team_seat_service.usage_for_org(None, self.team_a)
        # owner, Anna (both teams), Boris (team B), the pending invitation of team A
        self.assertEqual(usage.seats_used, 4)
        self.assertEqual(usage.seats_elsewhere, 1)  # Boris
        self.assertEqual(usage.readers, 1)  # Vera, team A only
        usage_b, _ = await team_seat_service.usage_for_org(None, self.team_b)
        self.assertEqual((usage_b.seats_used, usage_b.seats_elsewhere, usage_b.readers), (4, 1, 0))

    async def test_a_second_team_gives_no_second_set_of_seats(self):
        # Four seats bought, four taken over both teams: nobody new fits in either of them
        for team in (self.team_a, self.team_b):
            with self.assertRaises(HTTPException) as ctx:
                await team_seat_service.ensure_room(None, team, "editor", person=uuid.uuid4())
            self.assertEqual(ctx.exception.detail["limit"], "seats")

    async def test_someone_with_a_seat_in_another_team_fits_without_a_new_one(self):
        # Boris holds a seat in team B: he joins team A as an editor even though all seats are taken
        await team_seat_service.ensure_room(None, self.team_a, "editor", person=self.boris)
        # Vera is only a reader: making her an editor needs a free seat
        with self.assertRaises(HTTPException):
            await team_seat_service.ensure_room(
                None, self.team_a, "editor", replacing_role="reader", person=self.vera
            )


class EntitlementSeatsTests(unittest.TestCase):
    def _sub(self, plan_code, seats):
        now = datetime.now(timezone.utc)
        return SimpleNamespace(
            plan_code=plan_code,
            status="active",
            billing_interval="month",
            current_period_start=now - timedelta(days=1),
            current_period_end=now + timedelta(days=29),
            trial_ends_at=None,
            trial_used_at=None,
            cancel_at_period_end=False,
            limit_overrides=None,
            seats_count=seats,
            seat_window_ends_at=None,
        )

    def test_researcher_seats_come_from_the_subscription(self):
        ent = billing_service.resolve_entitlements(
            self._sub("researcher", 3), datetime.now(timezone.utc), 3
        )
        self.assertEqual(ent.seats, 3)

    def test_free_plan_and_pack_are_one_person_whatever_is_stored(self):
        for code in ("start", "pack"):
            ent = billing_service.resolve_entitlements(
                self._sub(code, 5), datetime.now(timezone.utc), 3
            )
            self.assertEqual(ent.seats, 1)

    def test_billing_off_has_no_seat_limit(self):
        ent = billing_service.unlimited_entitlements(datetime.now(timezone.utc))
        self.assertEqual(ent.seats, team_roles.SEATS_UNLIMITED)


class ReaderCannotChangeSurveysTests(unittest.IsolatedAsyncioTestCase):
    """A reader sees surveys and results; everything that writes or spends the AI is refused."""

    def _member(self, role):
        patch.object(
            survey_service.organization_repository,
            "get_member",
            AsyncMock(return_value=SimpleNamespace(role_tag=role)),
        ).start()
        self.addCleanup(patch.stopall)

    async def test_reader_is_refused_when_editing(self):
        self._member("reader")
        with self.assertRaises(HTTPException) as ctx:
            await survey_service._ensure_member(None, uuid.uuid4(), SimpleNamespace(id=uuid.uuid4()), edit=True)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_reader_may_look(self):
        self._member("reader")
        await survey_service._ensure_member(None, uuid.uuid4(), SimpleNamespace(id=uuid.uuid4()))

    async def test_editor_admin_owner_and_legacy_member_may_edit(self):
        for role in ("editor", "admin", "owner", "member"):
            with self.subTest(role=role):
                self._member(role)
                await survey_service._ensure_member(
                    None, uuid.uuid4(), SimpleNamespace(id=uuid.uuid4()), edit=True
                )

    async def test_reader_cannot_create_a_survey(self):
        self._member("reader")
        payload = SimpleNamespace(organization_id=str(uuid.uuid4()), pages=[], name="x")
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.create_survey(None, SimpleNamespace(id=uuid.uuid4()), payload)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_reader_cannot_order_an_ai_summary(self):
        self._member("reader")
        survey = SimpleNamespace(id=uuid.uuid4(), organization_id=uuid.uuid4())
        patch.object(
            survey_service.survey_repository, "get_by_id", AsyncMock(return_value=survey)
        ).start()
        with self.assertRaises(HTTPException) as ctx:
            await survey_service.generate_ai_summary(
                None,
                SimpleNamespace(id=uuid.uuid4()),
                str(survey.id),
                SimpleNamespace(exclude_flagged=True, force=False),
            )
        self.assertEqual(ctx.exception.status_code, 403)


class MemberRoleChangeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.owner = SimpleNamespace(id=uuid.uuid4())
        self.admin = SimpleNamespace(id=uuid.uuid4())
        self.editor_id = uuid.uuid4()
        self.org = SimpleNamespace(id=uuid.uuid4(), owner_user_id=self.owner.id)
        self.members = {
            self.admin.id: SimpleNamespace(role_tag="admin", user_id=self.admin.id),
            self.editor_id: SimpleNamespace(role_tag="editor", user_id=self.editor_id),
        }

        async def get_member(session, org_id, user_id):
            return self.members.get(user_id)

        patch.object(organization_service, "_get_org_or_404", AsyncMock(return_value=self.org)).start()
        patch.object(
            organization_service.organization_repository, "get_member", AsyncMock(side_effect=get_member)
        ).start()
        self.ensure_room = AsyncMock()
        patch.object(organization_service.team_seat_service, "ensure_room", self.ensure_room).start()
        session = SimpleNamespace(
            flush=AsyncMock(), refresh=AsyncMock(), commit=AsyncMock()
        )
        self.session = session
        self.addCleanup(patch.stopall)

    def _fill_member_view(self, member):
        member.user = SimpleNamespace(
            id=self.editor_id, first_name="A", last_name="B", middle_name=None, email="a@b.c"
        )
        member.id = uuid.uuid4()
        member.joined_at = datetime.now(timezone.utc)
        member.job_title = member.specialization = None
        member.token_plus_limit = None

    async def test_owner_can_make_an_editor_a_reader(self):
        self._fill_member_view(self.members[self.editor_id])
        result = await organization_service.update_member_role(
            self.session, self.org.id, self.editor_id, UpdateRoleRequest(role_tag="reader"), self.owner
        )
        self.assertEqual(result.role_tag, "reader")
        self.ensure_room.assert_awaited_once()

    async def test_owner_role_cannot_be_assigned(self):
        with self.assertRaises(HTTPException) as ctx:
            await organization_service.update_member_role(
                self.session, self.org.id, self.editor_id, UpdateRoleRequest(role_tag="owner"), self.owner
            )
        self.assertEqual(ctx.exception.status_code, 422)

    async def test_admin_cannot_make_another_admin(self):
        with self.assertRaises(HTTPException) as ctx:
            await organization_service.update_member_role(
                self.session, self.org.id, self.editor_id, UpdateRoleRequest(role_tag="admin"), self.admin
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_editor_cannot_change_roles(self):
        editor = SimpleNamespace(id=self.editor_id)
        other = uuid.uuid4()
        self.members[other] = SimpleNamespace(role_tag="reader", user_id=other)
        with self.assertRaises(HTTPException) as ctx:
            await organization_service.update_member_role(
                self.session, self.org.id, other, UpdateRoleRequest(role_tag="editor"), editor
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_nobody_changes_the_owner_role(self):
        self.members[self.owner.id] = SimpleNamespace(role_tag="owner", user_id=self.owner.id)
        with self.assertRaises(HTTPException) as ctx:
            await organization_service.update_member_role(
                self.session, self.org.id, self.owner.id, UpdateRoleRequest(role_tag="reader"), self.admin
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_the_old_member_tag_is_accepted_as_editor(self):
        member = self.members[self.editor_id]
        member.role_tag = "reader"
        self._fill_member_view(member)
        result = await organization_service.update_member_role(
            self.session, self.org.id, self.editor_id, UpdateRoleRequest(role_tag="member"), self.owner
        )
        self.assertEqual(result.role_tag, "editor")


class SeatUsageEndpointTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.owner = SimpleNamespace(id=uuid.uuid4())
        self.org = SimpleNamespace(id=uuid.uuid4(), owner_user_id=self.owner.id)
        self.role = "admin"
        self.entitlements = _entitlements(RESEARCHER, seats=3)
        self.usage = SeatUsage(seats_used=2, readers=4, seats_limit=3)

        async def get_member(session, org_id, user_id):
            return SimpleNamespace(role_tag=self.role)

        patch.object(organization_service, "_get_org_or_404", AsyncMock(return_value=self.org)).start()
        patch.object(
            organization_service.organization_repository, "get_member", AsyncMock(side_effect=get_member)
        ).start()
        patch.object(
            organization_service.team_seat_service,
            "usage_for_org",
            AsyncMock(side_effect=lambda session, org: (self.usage, self.entitlements)),
        ).start()
        self.quota = team_seat_service.TeamAiQuota()
        patch.object(
            organization_service.team_seat_service,
            "ai_quota_for_org",
            AsyncMock(side_effect=lambda session, org, ent: self.quota),
        ).start()
        self.addCleanup(patch.stopall)

    async def test_the_pool_and_the_spending_of_people_come_with_the_places(self):
        member_id = str(uuid.uuid4())
        resets = datetime.now(timezone.utc) + timedelta(days=12)
        self.quota = team_seat_service.TeamAiQuota(
            pool_used=2_800,
            pool_max=8_000,
            resets_at=resets,
            spent_by_user={member_id: 1_200},
            seat_window_days_left=5,
        )

        result = await organization_service.get_seat_usage(None, self.org.id, self.owner)

        self.assertEqual((result.ai_pool_used, result.ai_pool_max), (2_800, 8_000))
        self.assertEqual(result.ai_pool_resets_at, resets)
        self.assertEqual(result.ai_spent_by_user, {member_id: 1_200})
        self.assertEqual(result.seat_window_days_left, 5)

    async def test_without_a_pool_the_fields_are_empty(self):
        result = await organization_service.get_seat_usage(None, self.org.id, self.owner)

        self.assertIsNone(result.ai_pool_used)
        self.assertIsNone(result.ai_pool_max)
        self.assertEqual(result.ai_spent_by_user, {})
        self.assertEqual(result.seat_window_days_left, 0)

    async def test_the_owner_sees_places_and_readers(self):
        result = await organization_service.get_seat_usage(None, self.org.id, self.owner)

        self.assertEqual(
            (result.seats_used, result.seats_limit, result.readers, result.readers_limit),
            (2, 3, 4, team_roles.MAX_READERS_PER_TEAM),
        )
        self.assertEqual(result.plan_code, "researcher")

    async def test_an_admin_sees_them_too(self):
        result = await organization_service.get_seat_usage(None, self.org.id, SimpleNamespace(id=uuid.uuid4()))

        self.assertEqual(result.seats_used, 2)

    async def test_an_editor_sees_the_places_and_only_their_own_spending(self):
        self.role = "editor"
        editor = SimpleNamespace(id=uuid.uuid4())
        self.quota = team_seat_service.TeamAiQuota(
            pool_used=3_000, pool_max=8_000, spent_by_user={str(editor.id): 500, str(uuid.uuid4()): 2_500}
        )

        result = await organization_service.get_seat_usage(None, self.org.id, editor)

        self.assertEqual((result.seats_used, result.seats_limit), (2, 3))
        self.assertEqual(result.ai_spent_by_user, {})
        self.assertEqual(result.ai_spent_me, 500)
        self.assertEqual(result.ai_pool_used, 3_000)

    async def test_a_stranger_sees_nothing(self):
        async def no_member(session, org_id, user_id):
            return None

        with patch.object(
            organization_service.organization_repository, "get_member", AsyncMock(side_effect=no_member)
        ):
            with self.assertRaises(HTTPException) as ctx:
                await organization_service.get_seat_usage(None, self.org.id, SimpleNamespace(id=uuid.uuid4()))

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_with_billing_off_there_is_no_limit(self):
        self.entitlements = _entitlements(RESEARCHER, seats=team_roles.SEATS_UNLIMITED, enabled=False)
        self.usage = SeatUsage(seats_used=2, readers=0, seats_limit=team_roles.SEATS_UNLIMITED)

        result = await organization_service.get_seat_usage(None, self.org.id, self.owner)

        self.assertIsNone(result.seats_limit)
        self.assertFalse(result.billing_enabled)


class TeamAiQuotaTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.owner_id = uuid.uuid4()
        self.member_id = uuid.uuid4()
        self.org = SimpleNamespace(id=uuid.uuid4(), owner_user_id=self.owner_id)
        patch.object(
            team_seat_service.billing_repository,
            "get_usage",
            AsyncMock(return_value={"ai_tokens": 2_800}),
        ).start()
        patch.object(
            team_seat_service.billing_repository,
            "charged_tokens_by_user",
            AsyncMock(return_value={self.member_id: 1_200}),
        ).start()
        self.addCleanup(patch.stopall)

    async def test_a_paid_team_has_a_pool_and_the_spending_of_each_person(self):
        ent = _entitlements(RESEARCHER, seats=3)

        quota = await team_seat_service.ai_quota_for_org(None, self.org, ent)

        self.assertEqual(quota.pool_used, 2_800)
        self.assertEqual(quota.pool_max, ent.plan.ai_tokens_per_period)
        self.assertEqual(quota.spent_by_user, {str(self.member_id): 1_200})

    async def test_a_team_of_a_free_owner_has_no_pool(self):
        quota = await team_seat_service.ai_quota_for_org(None, self.org, _entitlements(START, seats=1))

        self.assertIsNone(quota.pool_used)
        self.assertIsNone(quota.pool_max)
        self.assertEqual(quota.spent_by_user, {})

    async def test_with_billing_off_there_is_no_pool(self):
        ent = _entitlements(RESEARCHER, seats=team_roles.SEATS_UNLIMITED, enabled=False)

        quota = await team_seat_service.ai_quota_for_org(None, self.org, ent)

        self.assertIsNone(quota.pool_used)


class MyOrganizationsPlanTests(unittest.IsolatedAsyncioTestCase):
    """The list of workspaces tells which plan each one works on (the plan of its owner)."""

    def setUp(self):
        me, other = uuid.uuid4(), uuid.uuid4()
        self.mine = SimpleNamespace(id=uuid.uuid4(), owner_user_id=me)
        self.theirs = SimpleNamespace(id=uuid.uuid4(), owner_user_id=other)
        self.plans = {me: _entitlements(RESEARCHER, seats=3), other: _entitlements(START, seats=1)}
        self.lookups: list = []

        async def entitlements(session, user_id):
            self.lookups.append(user_id)
            return self.plans[user_id]

        def to_response(org, members_count=0, my_role=None):
            return organization_service.OrganizationResponse(
                id=str(org.id),
                name="x",
                description=None,
                owner_user_id=str(org.owner_user_id),
                created_at="",
                updated_at="",
            )

        repo = organization_service.organization_repository
        patch.object(repo, "get_orgs_for_user", AsyncMock(return_value=[self.mine, self.theirs, self.mine])).start()
        patch.object(repo, "get_role_tags_for_user", AsyncMock(return_value={})).start()
        patch.object(repo, "count_members", AsyncMock(return_value=1)).start()
        patch.object(organization_service, "_to_org_response", to_response).start()
        patch.object(billing_service, "get_entitlements", AsyncMock(side_effect=entitlements)).start()
        self.addCleanup(patch.stopall)

    async def test_each_workspace_carries_the_plan_of_its_owner(self):
        result = await organization_service.get_my_organizations(None, SimpleNamespace(id=uuid.uuid4()))

        self.assertEqual([item.plan_code for item in result], [RESEARCHER.code, START.code, RESEARCHER.code])

    async def test_an_owner_is_looked_up_once(self):
        await organization_service.get_my_organizations(None, SimpleNamespace(id=uuid.uuid4()))

        self.assertEqual(len(self.lookups), 2)

    async def test_with_billing_off_there_is_no_plan(self):
        for owner_id in self.plans:
            self.plans[owner_id] = _entitlements(RESEARCHER, seats=team_roles.SEATS_UNLIMITED, enabled=False)

        result = await organization_service.get_my_organizations(None, SimpleNamespace(id=uuid.uuid4()))

        self.assertTrue(all(item.plan_code is None for item in result))


if __name__ == "__main__":
    unittest.main()
