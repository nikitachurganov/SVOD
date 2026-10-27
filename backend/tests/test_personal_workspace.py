from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.organization import Organization
from app.services import join_request_service, organization_service


def user():
    return SimpleNamespace(id=uuid.uuid4())


def org(owner, **overrides):
    now = datetime.now(timezone.utc)
    data = dict(
        id=uuid.uuid4(),
        name="Личное пространство",
        description=None,
        owner_user_id=owner.id,
        owner=None,
        is_personal=True,
        created_at=now,
        updated_at=now,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    return session


class PersonalWorkspaceTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_workspace_is_returned_without_creating(self):
        owner = user()
        repo = organization_service.organization_repository
        with (
            patch.object(repo, "get_personal_org", AsyncMock(return_value=org(owner))),
            patch.object(repo, "count_members", AsyncMock(return_value=1)),
            patch.object(repo, "create_org", AsyncMock()) as create,
        ):
            result = await organization_service.get_or_create_personal_organization(session_mock(), owner)
        create.assert_not_awaited()
        self.assertTrue(result.is_personal)
        self.assertEqual(result.owner_user_id, str(owner.id))

    async def test_missing_workspace_is_created_with_owner_membership(self):
        owner = user()
        session = session_mock()
        created = org(owner)
        repo = organization_service.organization_repository
        with (
            patch.object(repo, "get_personal_org", AsyncMock(return_value=None)),
            patch.object(repo, "create_org", AsyncMock(return_value=created)) as create,
            patch.object(repo, "add_member", AsyncMock()) as add_member,
            patch.object(repo, "count_members", AsyncMock(return_value=1)),
            patch.object(
                organization_service.welcome_seed_service, "seed_welcome_project", AsyncMock()
            ) as seed,
        ):
            result = await organization_service.get_or_create_personal_organization(session, owner)

        seed.assert_awaited_once_with(session, created.id, owner.id)
        new_org = create.await_args.args[1]
        self.assertTrue(new_org.is_personal)
        self.assertEqual(new_org.owner_user_id, owner.id)
        self.assertEqual(add_member.await_args.args[1].role_tag, "owner")
        session.commit.assert_awaited_once()
        self.assertTrue(result.is_personal)

    async def test_parallel_creation_falls_back_to_the_existing_workspace(self):
        owner = user()
        session = session_mock()
        winner = org(owner)
        repo = organization_service.organization_repository
        with (
            patch.object(repo, "get_personal_org", AsyncMock(side_effect=[None, winner])),
            patch.object(
                repo, "create_org", AsyncMock(side_effect=IntegrityError("insert", {}, Exception("dup")))
            ),
            patch.object(repo, "count_members", AsyncMock(return_value=1)),
            patch.object(
                organization_service.welcome_seed_service, "seed_welcome_project", AsyncMock()
            ) as seed,
        ):
            result = await organization_service.get_or_create_personal_organization(session, owner)
        seed.assert_not_awaited()
        session.rollback.assert_awaited_once()
        self.assertEqual(result.id, str(winner.id))


class PersonalWorkspaceIsNeverSharedTests(unittest.IsolatedAsyncioTestCase):
    def test_guard_refuses_personal_and_allows_regular(self):
        with self.assertRaises(HTTPException) as ctx:
            organization_service.ensure_not_personal(org(user()))
        self.assertEqual(ctx.exception.status_code, 400)
        organization_service.ensure_not_personal(org(user(), is_personal=False))

    async def test_personal_workspace_cannot_be_deleted(self):
        owner = user()
        repo = organization_service.organization_repository
        with (
            patch.object(repo, "get_org_by_id", AsyncMock(return_value=org(owner))),
            patch.object(repo, "delete_org", AsyncMock()) as delete,
        ):
            with self.assertRaises(HTTPException) as ctx:
                await organization_service.delete_organization(session_mock(), uuid.uuid4(), owner)
        self.assertEqual(ctx.exception.status_code, 400)
        delete.assert_not_awaited()

    async def test_regular_organization_is_still_deleted(self):
        owner = user()
        repo = organization_service.organization_repository
        with (
            patch.object(repo, "get_org_by_id", AsyncMock(return_value=org(owner, is_personal=False))),
            patch.object(repo, "delete_org", AsyncMock()) as delete,
        ):
            await organization_service.delete_organization(session_mock(), uuid.uuid4(), owner)
        delete.assert_awaited_once()

    async def test_join_link_cannot_be_opened_for_personal_workspace(self):
        owner = user()
        repo = organization_service.organization_repository
        with patch.object(repo, "get_org_by_id", AsyncMock(return_value=org(owner))):
            with self.assertRaises(HTTPException) as ctx:
                await join_request_service.set_join_link_enabled(
                    session_mock(), uuid.uuid4(), True, owner
                )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_model_defaults_to_a_regular_organization(self):
        self.assertIs(Organization.is_personal.default.arg, False)


if __name__ == "__main__":
    unittest.main()
