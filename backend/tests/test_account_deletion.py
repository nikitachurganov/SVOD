from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.core.security import hash_password
from app.schemas.auth import DeleteAccountRequest
from app.services import account_deletion_service as service
from app.services import auth_service


def user_ns(**overrides):
    data = dict(
        id=uuid.uuid4(),
        email="User@Example.com",
        password_hash=hash_password("Secret123"),
        avatar_url=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def org_ns(name="Орг", is_personal=False):
    return SimpleNamespace(id=uuid.uuid4(), name=name, is_personal=is_personal)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


class DeleteAccountTests(unittest.IsolatedAsyncioTestCase):
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
        }.items():
            patcher = patch.object(service.repo, name, AsyncMock(return_value=value))
            self.repo[name] = patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch.object(service.storage_service, "delete_object", AsyncMock())
        self.delete_object = patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch.object(service.settings, "FILE_STORAGE_BACKEND", "s3")
        patcher.start()
        self.addCleanup(patcher.stop)

    async def test_wrong_password_deletes_nothing(self):
        session = session_mock()
        with self.assertRaises(HTTPException) as ctx:
            await service.delete_account(session, user_ns(), DeleteAccountRequest(password="nope"))

        self.assertEqual(ctx.exception.status_code, 400)
        self.repo["delete_user"].assert_not_awaited()
        session.commit.assert_not_awaited()

    async def test_organization_with_other_members_blocks_deletion(self):
        self.repo["list_owned_organizations"].return_value = [org_ns("Команда"), org_ns("Личное", True)]
        self.repo["count_other_members"].return_value = 3
        session = session_mock()

        with self.assertRaises(HTTPException) as ctx:
            await service.delete_account(session, user_ns(), DeleteAccountRequest(password="Secret123"))

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("«Команда»", ctx.exception.detail)
        self.assertNotIn("Личное", ctx.exception.detail)
        self.repo["delete_user"].assert_not_awaited()
        session.commit.assert_not_awaited()

    async def test_everything_is_deleted_and_files_removed_after_commit(self):
        user = user_ns()
        personal, own_empty = org_ns("Личное", True), org_ns("Моя")
        self.repo["list_owned_organizations"].return_value = [personal, own_empty]
        self.repo["list_request_ids"].return_value = [1, 2]
        bucket = service.settings.S3_BUCKET
        self.repo["list_storage_references"].return_value = (
            [f"s3://{bucket}/requests/1/form/f/a.pdf", "legacy-without-binary"],
            ["requests/2/stages/s/b.png"],
        )
        session = session_mock()
        order: list[str] = []
        session.commit.side_effect = lambda: order.append("commit")
        self.delete_object.side_effect = lambda key: order.append(f"s3:{key}")

        await service.delete_account(session, user, DeleteAccountRequest(password="Secret123"))

        self.repo["list_request_ids"].assert_awaited_once_with(session, [personal.id, own_empty.id], user.id)
        self.repo["delete_requests"].assert_awaited_once_with(session, [1, 2])
        self.repo["delete_organization_content"].assert_awaited_once_with(session, [personal.id, own_empty.id])
        self.repo["delete_invitations_for"].assert_awaited_once_with(session, user.id, user.email)
        self.repo["delete_user"].assert_awaited_once_with(session, user.id)
        self.assertEqual(
            order, ["commit", "s3:requests/1/form/f/a.pdf", "s3:requests/2/stages/s/b.png"]
        )

    async def test_profile_photo_is_removed_with_the_account(self):
        bucket = service.settings.S3_BUCKET
        user = user_ns(avatar_url=f"s3://{bucket}/avatars/{uuid.uuid4()}/a.png")

        await service.delete_account(session_mock(), user, DeleteAccountRequest(password="Secret123"))

        self.delete_object.assert_awaited_once_with(user.avatar_url[len(f"s3://{bucket}/"):])

    async def test_failed_file_removal_does_not_fail_the_deletion(self):
        self.repo["list_storage_references"].return_value = ([], ["a", "b"])
        self.delete_object.side_effect = [RuntimeError("s3 down"), None]

        await service.delete_account(session_mock(), user_ns(), DeleteAccountRequest(password="Secret123"))

        self.assertEqual(self.delete_object.await_count, 2)

    async def test_files_are_left_alone_without_s3_backend(self):
        self.repo["list_storage_references"].return_value = ([], ["a"])
        with patch.object(service.settings, "FILE_STORAGE_BACKEND", "local"):
            await service.delete_account(
                session_mock(), user_ns(), DeleteAccountRequest(password="Secret123")
            )

        self.delete_object.assert_not_awaited()
