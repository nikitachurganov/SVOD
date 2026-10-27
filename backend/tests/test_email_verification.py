from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.core.security import hash_password
from app.schemas.auth import EmailVerificationRequest, PasswordResetConfirm, RegisterRequest
from app.services import auth_service


def user_ns(**overrides):
    data = dict(
        id=uuid.uuid4(),
        email="user@example.com",
        first_name="Анна",
        password_hash=hash_password("OldPassword1"),
        is_active=True,
        email_verified_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def token_row(user, **overrides):
    data = dict(
        user_id=user.id,
        used_at=None,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


def repo_patches(*, row=None, last_created=None):
    repo = auth_service.email_verification_repository
    return (
        patch.object(repo, "get_by_hash", AsyncMock(return_value=row)),
        patch.object(repo, "latest_created_at", AsyncMock(return_value=last_created)),
        patch.object(repo, "invalidate_unused", AsyncMock()),
        patch.object(repo, "create", AsyncMock()),
    )


class RegisterTests(unittest.IsolatedAsyncioTestCase):
    async def test_new_account_gets_a_confirmation_link(self):
        user = user_ns()
        payload = RegisterRequest(
            first_name="Анна", last_name="Иванова", email="user@example.com", password="Password123"
        )
        _, _, invalidate, create = repo_patches()
        with (
            patch.object(auth_service, "create_account", AsyncMock(return_value=user)),
            invalidate,
            create as created,
            patch.object(auth_service.settings, "APP_PUBLIC_URL", "https://app.example.com"),
        ):
            token, delivery = await auth_service.register(session_mock(), payload)

        self.assertTrue(token.access_token)
        prefix = "https://app.example.com/verify-email/"
        self.assertTrue(delivery.url.startswith(prefix))
        # Only the hash is stored, never the raw token
        stored = created.await_args.kwargs
        self.assertEqual(stored["token_hash"], auth_service._hash_reset_token(delivery.url[len(prefix):]))

    async def test_already_confirmed_account_gets_nothing(self):
        user = user_ns(email_verified_at=datetime.now(timezone.utc))
        payload = RegisterRequest(
            first_name="Анна", last_name="Иванова", email="user@example.com", password="Password123"
        )
        with patch.object(auth_service, "create_account", AsyncMock(return_value=user)):
            _, delivery = await auth_service.register(session_mock(), payload)
        self.assertIsNone(delivery)

    async def test_surveys_service_link_points_to_the_surveys_app(self):
        user = user_ns()
        payload = RegisterRequest(
            first_name="Анна",
            last_name="Иванова",
            email="user@example.com",
            password="Password123",
            service="surveys",
        )
        _, _, invalidate, create = repo_patches()
        with (
            patch.object(auth_service, "create_account", AsyncMock(return_value=user)),
            invalidate,
            create,
            patch.object(auth_service.settings, "SURVEYS_APP_PUBLIC_URL", "https://surveys.example.com"),
        ):
            _, delivery = await auth_service.register(session_mock(), payload)
        self.assertTrue(delivery.url.startswith("https://surveys.example.com/verify-email/"))


class ResendTests(unittest.IsolatedAsyncioTestCase):
    async def test_confirmed_account_gets_nothing(self):
        user = user_ns(email_verified_at=datetime.now(timezone.utc))
        session = session_mock()
        _, latest, _, create = repo_patches()
        with latest, create as created:
            result = await auth_service.request_email_verification(session, user, "platform")
        self.assertIsNone(result)
        created.assert_not_awaited()
        session.commit.assert_not_awaited()

    async def test_repeated_request_within_cooldown_is_refused(self):
        user = user_ns()
        _, latest, _, create = repo_patches(last_created=datetime.now(timezone.utc) - timedelta(seconds=5))
        with latest, create as created:
            with self.assertRaises(HTTPException) as ctx:
                await auth_service.request_email_verification(session_mock(), user, "platform")
        self.assertEqual(ctx.exception.status_code, 429)
        created.assert_not_awaited()

    async def test_request_after_cooldown_sends_a_new_link_and_burns_old_ones(self):
        user = user_ns()
        session = session_mock()
        _, latest, invalidate, create = repo_patches(last_created=datetime.now(timezone.utc) - timedelta(hours=1))
        with latest, invalidate as burned, create:
            result = await auth_service.request_email_verification(session, user, "platform")
        self.assertIsNotNone(result)
        burned.assert_awaited_once()
        session.commit.assert_awaited_once()


class ConfirmTests(unittest.IsolatedAsyncioTestCase):
    def _patches(self, row, user):
        get_row, _, invalidate, _ = repo_patches(row=row)
        return get_row, invalidate, patch.object(
            auth_service.user_repository, "get_by_id", AsyncMock(return_value=user)
        )

    async def test_valid_link_confirms_the_mailbox(self):
        user = user_ns()
        session = session_mock()
        get_row, invalidate, get_user = self._patches(token_row(user), user)
        with get_row, invalidate as burned, get_user:
            await auth_service.confirm_email_verification(session, "token")
        self.assertIsNotNone(user.email_verified_at)
        burned.assert_awaited_once()
        session.commit.assert_awaited_once()

    async def test_unknown_used_and_expired_links_are_refused(self):
        user = user_ns()
        cases = {
            "unknown": None,
            "used": token_row(user, used_at=datetime.now(timezone.utc)),
            "expired": token_row(user, expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)),
        }
        for name, row in cases.items():
            with self.subTest(name):
                session = session_mock()
                get_row, invalidate, get_user = self._patches(row, user)
                with get_row, invalidate, get_user:
                    with self.assertRaises(HTTPException) as ctx:
                        await auth_service.confirm_email_verification(session, "token")
                self.assertEqual(ctx.exception.status_code, 404)
                self.assertIsNone(user.email_verified_at)
                session.commit.assert_not_awaited()

    async def test_opening_the_link_twice_is_not_an_error(self):
        confirmed_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        user = user_ns(email_verified_at=confirmed_at)
        session = session_mock()
        get_row, invalidate, get_user = self._patches(token_row(user, used_at=confirmed_at), user)
        with get_row, invalidate, get_user:
            await auth_service.confirm_email_verification(session, "token")
        self.assertEqual(user.email_verified_at, confirmed_at)
        session.commit.assert_not_awaited()

    async def test_deactivated_account_is_refused(self):
        user = user_ns(is_active=False)
        get_row, invalidate, get_user = self._patches(token_row(user), user)
        with get_row, invalidate, get_user:
            with self.assertRaises(HTTPException) as ctx:
                await auth_service.confirm_email_verification(session_mock(), "token")
        self.assertEqual(ctx.exception.status_code, 404)


class OtherProofsOfMailboxTests(unittest.IsolatedAsyncioTestCase):
    async def test_password_reset_by_email_link_confirms_the_mailbox(self):
        user = user_ns()
        row = SimpleNamespace(
            user_id=user.id, used_at=None, expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)
        )
        repo = auth_service.password_reset_repository
        with (
            patch.object(repo, "get_by_hash", AsyncMock(return_value=row)),
            patch.object(repo, "invalidate_unused", AsyncMock()),
            patch.object(auth_service.user_repository, "get_by_id", AsyncMock(return_value=user)),
        ):
            await auth_service.confirm_password_reset(
                session_mock(), "token", PasswordResetConfirm(password="NewPassword2")
            )
        self.assertIsNotNone(user.email_verified_at)


class SchemaTests(unittest.TestCase):
    def test_service_is_limited_to_known_values(self):
        with self.assertRaises(ValueError):
            EmailVerificationRequest(service="evil")
        with self.assertRaises(ValueError):
            RegisterRequest(
                first_name="Анна",
                last_name="Иванова",
                email="user@example.com",
                password="Password123",
                service="evil",
            )


if __name__ == "__main__":
    unittest.main()
