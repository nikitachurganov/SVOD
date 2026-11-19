from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import join_request_service, organization_service


def user():
    return SimpleNamespace(id=uuid.uuid4())


def org(owner, age_days=0, **overrides):
    now = datetime.now(timezone.utc)
    data = dict(
        id=uuid.uuid4(),
        name="Моя команда",
        description=None,
        owner_user_id=owner.id,
        owner=None,
        created_at=now - timedelta(days=age_days),
        updated_at=now,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    session.execute = AsyncMock()
    return session


class DefaultWorkspaceTests(unittest.IsolatedAsyncioTestCase):
    async def test_a_person_with_a_team_gets_their_own_oldest_one_without_creating(self):
        owner = user()
        newer, older = org(owner), org(owner, age_days=5)
        guest_team = org(user(), age_days=9)
        repo = organization_service.organization_repository
        with (
            patch.object(repo, "get_orgs_for_user", AsyncMock(return_value=[newer, guest_team, older])),
            patch.object(repo, "get_role_tags_for_user", AsyncMock(return_value={older.id: "owner"})),
            patch.object(repo, "count_members", AsyncMock(return_value=3)),
            patch.object(repo, "create_org", AsyncMock()) as create,
        ):
            result = await organization_service.get_or_create_default_organization(session_mock(), owner)
        create.assert_not_awaited()
        self.assertEqual(result.id, str(older.id))
        self.assertEqual(result.members_count, 3)

    async def test_a_person_who_only_joined_someone_elses_team_gets_it_not_a_new_one(self):
        guest = user()
        theirs = org(user())
        repo = organization_service.organization_repository
        with (
            patch.object(repo, "get_orgs_for_user", AsyncMock(return_value=[theirs])),
            patch.object(repo, "get_role_tags_for_user", AsyncMock(return_value={theirs.id: "editor"})),
            patch.object(repo, "count_members", AsyncMock(return_value=2)),
            patch.object(repo, "create_org", AsyncMock()) as create,
        ):
            result = await organization_service.get_or_create_default_organization(session_mock(), guest)
        create.assert_not_awaited()
        self.assertEqual(result.id, str(theirs.id))
        self.assertEqual(result.my_role, "editor")

    async def test_a_person_without_teams_gets_a_regular_team_with_the_sample_survey(self):
        owner = user()
        session = session_mock()
        created = org(owner)
        repo = organization_service.organization_repository
        with (
            patch.object(repo, "get_orgs_for_user", AsyncMock(return_value=[])),
            patch.object(repo, "get_role_tags_for_user", AsyncMock(return_value={})),
            patch.object(repo, "create_org", AsyncMock(return_value=created)) as create,
            patch.object(repo, "add_member", AsyncMock()) as add_member,
            patch.object(repo, "count_members", AsyncMock(return_value=1)),
            patch.object(
                organization_service.welcome_seed_service, "seed_welcome_project", AsyncMock()
            ) as seed,
        ):
            result = await organization_service.get_or_create_default_organization(session, owner)

        session.execute.assert_awaited_once()  # the per-user advisory lock
        seed.assert_awaited_once_with(session, created.id, owner.id)
        new_org = create.await_args.args[1]
        self.assertEqual(new_org.name, organization_service.DEFAULT_ORGANIZATION_NAME)
        self.assertEqual(new_org.owner_user_id, owner.id)
        self.assertEqual(add_member.await_args.args[1].role_tag, "owner")
        session.commit.assert_awaited_once()
        self.assertEqual(result.my_role, "owner")
        self.assertFalse(hasattr(result, "is_personal"))

    async def test_a_parallel_request_that_lost_the_lock_race_reuses_the_created_team(self):
        owner = user()
        session = session_mock()
        winner = org(owner)
        repo = organization_service.organization_repository
        with (
            patch.object(
                repo, "get_orgs_for_user", AsyncMock(side_effect=[[], [winner]])
            ),
            patch.object(repo, "get_role_tags_for_user", AsyncMock(return_value={winner.id: "owner"})),
            patch.object(repo, "create_org", AsyncMock()) as create,
            patch.object(repo, "count_members", AsyncMock(return_value=1)),
        ):
            result = await organization_service.get_or_create_default_organization(session, owner)
        create.assert_not_awaited()
        self.assertEqual(result.id, str(winner.id))


class EveryWorkspaceIsATeamTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_first_team_can_be_deleted(self):
        owner = user()
        repo = organization_service.organization_repository
        with (
            patch.object(repo, "get_org_by_id", AsyncMock(return_value=org(owner))),
            patch.object(repo, "delete_org", AsyncMock()) as delete,
        ):
            await organization_service.delete_organization(session_mock(), uuid.uuid4(), owner)
        delete.assert_awaited_once()

    async def test_the_join_link_can_be_opened_for_the_first_team(self):
        owner = user()
        repo = organization_service.organization_repository
        with patch.object(
            repo, "get_org_by_id", AsyncMock(return_value=org(owner, join_token=None, join_link_enabled=False))
        ):
            result = await join_request_service.set_join_link_enabled(
                session_mock(), uuid.uuid4(), True, owner
            )
        self.assertTrue(result.enabled)


if __name__ == "__main__":
    unittest.main()
