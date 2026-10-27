from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.core.security import hash_password, verify_password
from app.schemas.auth import ChangePasswordRequest, UpdateProfileRequest
from app.services import auth_service


def user_ns(**overrides):
    data = dict(
        id=uuid.uuid4(),
        email="user@example.com",
        first_name="Анна",
        last_name="Иванова",
        middle_name=None,
        full_name="Иванова Анна",
        phone_number="+79990000000",
        avatar_url=None,
        created_at=SimpleNamespace(isoformat=lambda: "2026-01-01T00:00:00+00:00"),
        password_hash=hash_password("OldPassword1"),
        is_active=True,
        role="user",
        email_verified_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


class UpdateProfileTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        patcher = patch.object(auth_service.user_onboarding_repository, "get", AsyncMock(return_value=None))
        patcher.start()
        self.addCleanup(patcher.stop)

    async def test_name_is_changed_and_display_name_rebuilt(self):
        user = user_ns()
        session = session_mock()
        payload = UpdateProfileRequest(first_name="  Мария ", last_name="Петрова", middle_name="Олеговна")

        result = await auth_service.update_profile(session, user, payload)

        self.assertEqual((user.first_name, user.last_name, user.middle_name), ("Мария", "Петрова", "Олеговна"))
        self.assertEqual(user.full_name, "Петрова Мария Олеговна")
        self.assertEqual(result.fullName, "Петрова Мария Олеговна")
        session.commit.assert_awaited_once()

    async def test_middle_name_can_be_cleared_and_phone_is_kept(self):
        user = user_ns(middle_name="Олеговна")
        payload = UpdateProfileRequest(first_name="Анна", last_name="Иванова", middle_name="   ")

        await auth_service.update_profile(session_mock(), user, payload)

        self.assertIsNone(user.middle_name)
        self.assertEqual(user.phone_number, "+79990000000")
        self.assertEqual(user.email, "user@example.com")

    def test_blank_first_or_last_name_is_refused(self):
        for first, last in (("   ", "Иванова"), ("Анна", ""), ("Анна", "   ")):
            with self.subTest(first=first, last=last):
                with self.assertRaises(ValueError):
                    UpdateProfileRequest(first_name=first, last_name=last)


class ChangePasswordTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        auth_service._failed_password_attempts.clear()
        repo = auth_service.password_reset_repository
        patcher = patch.object(repo, "invalidate_unused", AsyncMock())
        self.invalidate = patcher.start()
        self.addCleanup(patcher.stop)

    async def test_right_current_password_sets_the_new_one_and_burns_reset_links(self):
        user = user_ns()
        session = session_mock()

        await auth_service.change_password(
            session, user, ChangePasswordRequest(current_password="OldPassword1", new_password="NewPassword2")
        )

        self.assertTrue(verify_password("NewPassword2", user.password_hash))
        self.assertFalse(verify_password("OldPassword1", user.password_hash))
        self.invalidate.assert_awaited_once()
        session.commit.assert_awaited_once()

    async def test_wrong_current_password_is_refused_with_400_not_401(self):
        user = user_ns()
        session = session_mock()
        old_hash = user.password_hash

        with self.assertRaises(HTTPException) as ctx:
            await auth_service.change_password(
                session, user, ChangePasswordRequest(current_password="Nope12345", new_password="NewPassword2")
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(user.password_hash, old_hash)
        session.commit.assert_not_awaited()

    async def test_new_password_must_differ_from_the_current_one(self):
        user = user_ns()
        session = session_mock()

        with self.assertRaises(HTTPException) as ctx:
            await auth_service.change_password(
                session, user, ChangePasswordRequest(current_password="OldPassword1", new_password="OldPassword1")
            )

        self.assertEqual(ctx.exception.status_code, 400)
        session.commit.assert_not_awaited()

    async def test_guessing_is_stopped_after_repeated_failures(self):
        user = user_ns()
        wrong = ChangePasswordRequest(current_password="Nope12345", new_password="NewPassword2")
        for _ in range(auth_service._MAX_PASSWORD_ATTEMPTS):
            with self.assertRaises(HTTPException) as ctx:
                await auth_service.change_password(session_mock(), user, wrong)
            self.assertEqual(ctx.exception.status_code, 400)

        # Even the right password is not checked any more until the window passes
        with self.assertRaises(HTTPException) as ctx:
            await auth_service.change_password(
                session_mock(), user, ChangePasswordRequest(current_password="OldPassword1", new_password="NewPassword2")
            )
        self.assertEqual(ctx.exception.status_code, 429)

    async def test_success_resets_the_failure_counter(self):
        user = user_ns()
        wrong = ChangePasswordRequest(current_password="Nope12345", new_password="NewPassword2")
        with self.assertRaises(HTTPException):
            await auth_service.change_password(session_mock(), user, wrong)

        await auth_service.change_password(
            session_mock(), user, ChangePasswordRequest(current_password="OldPassword1", new_password="NewPassword2")
        )

        self.assertNotIn(user.id, auth_service._failed_password_attempts)

    def test_short_and_oversized_passwords_are_refused(self):
        for new_password in ("short", "я" * 40):  # 40 Cyrillic letters are 80 bytes
            with self.subTest(new_password=new_password):
                with self.assertRaises(ValueError):
                    ChangePasswordRequest(current_password="OldPassword1", new_password=new_password)


if __name__ == "__main__":
    unittest.main()
