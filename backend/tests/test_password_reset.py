from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.core.security import PENDING_ACTIVATION_HASH, hash_password, verify_password
from app.schemas.auth import PasswordResetConfirm, PasswordResetRequest
from app.services import auth_service


def active_user(**overrides):
    data = dict(
        id=uuid.uuid4(),
        email="user@example.com",
        first_name="Анна",
        password_hash=hash_password("OldPassword1"),
        is_active=True,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def reset_row(user, **overrides):
    data = dict(
        user_id=user.id,
        used_at=None,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


class RequestPasswordResetTests(unittest.IsolatedAsyncioTestCase):
    def _patches(self, user, last_created=None):
        repo = auth_service.password_reset_repository
        return (
            patch.object(auth_service.user_repository, "get_by_email", AsyncMock(return_value=user)),
            patch.object(repo, "latest_created_at", AsyncMock(return_value=last_created)),
            patch.object(repo, "invalidate_unused", AsyncMock()),
            patch.object(repo, "create", AsyncMock()),
        )

    async def test_unknown_email_sends_nothing(self):
        session = session_mock()
        p1, p2, p3, p4 = self._patches(None)
        with p1, p2, p3, p4 as create:
            result = await auth_service.request_password_reset(session, "nobody@example.com", "platform")
        self.assertIsNone(result)
        create.assert_not_awaited()
        session.commit.assert_not_awaited()

    async def test_pending_and_deactivated_accounts_are_skipped(self):
        for user in (
            active_user(password_hash=PENDING_ACTIVATION_HASH, is_active=False),
            active_user(is_active=False),
        ):
            session = session_mock()
            p1, p2, p3, p4 = self._patches(user)
            with p1, p2, p3, p4 as create:
                result = await auth_service.request_password_reset(session, user.email, "platform")
            self.assertIsNone(result)
            create.assert_not_awaited()

    async def test_active_account_gets_link_and_only_the_hash_is_stored(self):
        user = active_user()
        session = session_mock()
        p1, p2, p3, p4 = self._patches(user)
        with p1, p2, p3 as invalidate, p4 as create:
            with patch.object(auth_service.settings, "APP_PUBLIC_URL", "https://app.example.com/"):
                delivery = await auth_service.request_password_reset(session, " User@Example.com ", "platform")

        self.assertIsNotNone(delivery)
        self.assertEqual(delivery.email, user.email)
        prefix = "https://app.example.com/reset-password/"
        self.assertTrue(delivery.url.startswith(prefix))
        token = delivery.url[len(prefix):]
        stored = create.await_args.kwargs
        self.assertEqual(stored["token_hash"], auth_service._hash_reset_token(token))
        self.assertNotIn(token, stored["token_hash"])
        invalidate.assert_awaited_once()
        session.commit.assert_awaited_once()

    async def test_surveys_service_uses_its_own_public_url(self):
        user = active_user()
        p1, p2, p3, p4 = self._patches(user)
        with p1, p2, p3, p4:
            with (
                patch.object(auth_service.settings, "APP_PUBLIC_URL", "https://app.example.com"),
                patch.object(auth_service.settings, "SURVEYS_APP_PUBLIC_URL", "https://surveys.example.com"),
            ):
                delivery = await auth_service.request_password_reset(session_mock(), user.email, "surveys")
        self.assertTrue(delivery.url.startswith("https://surveys.example.com/reset-password/"))

    async def test_surveys_service_falls_back_to_app_url_when_not_configured(self):
        user = active_user()
        p1, p2, p3, p4 = self._patches(user)
        with p1, p2, p3, p4:
            with (
                patch.object(auth_service.settings, "APP_PUBLIC_URL", "https://app.example.com"),
                patch.object(auth_service.settings, "SURVEYS_APP_PUBLIC_URL", ""),
            ):
                delivery = await auth_service.request_password_reset(session_mock(), user.email, "surveys")
        self.assertTrue(delivery.url.startswith("https://app.example.com/reset-password/"))

    async def test_repeated_request_within_cooldown_is_ignored(self):
        user = active_user()
        session = session_mock()
        p1, p2, p3, p4 = self._patches(user, last_created=datetime.now(timezone.utc) - timedelta(seconds=5))
        with p1, p2, p3, p4 as create:
            result = await auth_service.request_password_reset(session, user.email, "platform")
        self.assertIsNone(result)
        create.assert_not_awaited()

    async def test_request_after_cooldown_is_served(self):
        user = active_user()
        p1, p2, p3, p4 = self._patches(user, last_created=datetime.now(timezone.utc) - timedelta(hours=1))
        with p1, p2, p3, p4:
            result = await auth_service.request_password_reset(session_mock(), user.email, "platform")
        self.assertIsNotNone(result)


class ConfirmPasswordResetTests(unittest.IsolatedAsyncioTestCase):
    def _patches(self, row, user):
        repo = auth_service.password_reset_repository
        return (
            patch.object(repo, "get_by_hash", AsyncMock(return_value=row)),
            patch.object(repo, "invalidate_unused", AsyncMock()),
            patch.object(auth_service.user_repository, "get_by_id", AsyncMock(return_value=user)),
        )

    async def test_valid_link_sets_new_password_and_burns_links(self):
        user = active_user()
        session = session_mock()
        p1, p2, p3 = self._patches(reset_row(user), user)
        with p1, p2 as invalidate, p3:
            await auth_service.confirm_password_reset(
                session, "token", PasswordResetConfirm(password="NewPassword2")
            )
        self.assertTrue(verify_password("NewPassword2", user.password_hash))
        self.assertFalse(verify_password("OldPassword1", user.password_hash))
        invalidate.assert_awaited_once()
        session.commit.assert_awaited_once()

    async def test_unknown_used_and_expired_links_are_refused(self):
        user = active_user()
        cases = {
            "unknown": None,
            "used": reset_row(user, used_at=datetime.now(timezone.utc)),
            "expired": reset_row(user, expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)),
        }
        for name, row in cases.items():
            with self.subTest(name):
                session = session_mock()
                p1, p2, p3 = self._patches(row, user)
                with p1, p2, p3:
                    with self.assertRaises(HTTPException) as ctx:
                        await auth_service.confirm_password_reset(
                            session, "token", PasswordResetConfirm(password="NewPassword2")
                        )
                self.assertEqual(ctx.exception.status_code, 404)
                session.commit.assert_not_awaited()

    async def test_link_of_deactivated_account_is_refused(self):
        user = active_user(is_active=False)
        p1, p2, p3 = self._patches(reset_row(user), user)
        with p1, p2, p3:
            with self.assertRaises(HTTPException) as ctx:
                await auth_service.check_password_reset_token(session_mock(), "token")
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_check_accepts_a_live_link(self):
        user = active_user()
        p1, p2, p3 = self._patches(reset_row(user), user)
        with p1, p2, p3:
            await auth_service.check_password_reset_token(session_mock(), "token")


class DeliveryTests(unittest.IsolatedAsyncioTestCase):
    def _delivery(self):
        return auth_service.PasswordResetDelivery(
            email="user@example.com", first_name="Анна", url="http://localhost/reset-password/abc"
        )

    async def test_link_goes_to_the_log_when_smtp_is_not_configured(self):
        with (
            patch.object(auth_service.email_service, "send_password_reset", AsyncMock(return_value=False)),
            patch.object(auth_service.email_service, "is_configured", return_value=False),
            self.assertLogs(auth_service.logger, level="WARNING") as logs,
        ):
            await auth_service.deliver_password_reset(self._delivery())
        self.assertIn("http://localhost/reset-password/abc", logs.output[0])

    async def test_link_is_not_logged_when_the_email_was_sent(self):
        with (
            patch.object(auth_service.email_service, "send_password_reset", AsyncMock(return_value=True)),
            self.assertNoLogs(auth_service.logger, level="WARNING"),
        ):
            await auth_service.deliver_password_reset(self._delivery())


class SchemaTests(unittest.TestCase):
    def test_service_is_limited_to_known_values(self):
        with self.assertRaises(ValueError):
            PasswordResetRequest(email="user@example.com", service="evil")

    def test_short_password_is_refused(self):
        with self.assertRaises(ValueError):
            PasswordResetConfirm(password="short")


if __name__ == "__main__":
    unittest.main()
