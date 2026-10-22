from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.core.security import (
    PENDING_ACTIVATION_HASH,
    hash_password,
    is_pending_activation,
    verify_password,
)
from app.schemas.auth import ActivateAccountRequest, LoginRequest
from app.services import auth_service


class PendingActivationPasswordTests(unittest.TestCase):
    def test_pending_account_never_matches_a_password(self):
        self.assertTrue(is_pending_activation(PENDING_ACTIVATION_HASH))
        for guess in ("", "!pending-activation", "password123"):
            self.assertFalse(verify_password(guess, PENDING_ACTIVATION_HASH))

    def test_regular_hash_still_verifies(self):
        hashed = hash_password("Password123")
        self.assertFalse(is_pending_activation(hashed))
        self.assertTrue(verify_password("Password123", hashed))


def pending_user():
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="new@example.com",
        first_name="Анна",
        last_name="Иванова",
        middle_name=None,
        phone_number="",
        full_name="Иванова Анна",
        password_hash=PENDING_ACTIVATION_HASH,
        is_active=False,
    )


def account_invitation(user, **overrides):
    data = dict(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        kind="new_account",
        status="pending",
        role_tag="member",
        job_title="Дизайнер",
        specialization="Полиграфия",
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        invited_user=user,
        invited_by=None,
        organization=SimpleNamespace(name="Org"),
    )
    data.update(overrides)
    return SimpleNamespace(**data)


class LoginPendingAccountTests(unittest.IsolatedAsyncioTestCase):
    async def test_login_to_pending_account_is_refused_with_hint(self):
        session = MagicMock()
        with patch.object(auth_service.user_repository, "get_by_email", AsyncMock(return_value=pending_user())):
            with self.assertRaises(HTTPException) as ctx:
                await auth_service.login(session, LoginRequest(email="new@example.com", password="anything1"))
        self.assertEqual(ctx.exception.status_code, 403)


class ActivationTests(unittest.IsolatedAsyncioTestCase):
    def _payload(self):
        return ActivateAccountRequest(
            first_name="Анна", last_name="Иванова", phone_number="+79990000000", password="Password123"
        )

    async def test_activation_sets_password_joins_org_and_consumes_link(self):
        user = pending_user()
        inv = account_invitation(user)
        session = MagicMock()
        session.commit = AsyncMock()
        with (
            patch.object(auth_service.organization_repository, "get_invitation_by_code", AsyncMock(return_value=inv)),
            patch.object(auth_service.organization_repository, "get_member", AsyncMock(return_value=None)),
        ):
            token = await auth_service.activate_account(session, "code", self._payload())

        self.assertTrue(token.access_token)
        self.assertTrue(user.is_active)
        self.assertTrue(verify_password("Password123", user.password_hash))
        self.assertEqual(inv.status, "accepted")
        member = session.add.call_args.args[0]
        self.assertEqual(member.job_title, "Дизайнер")
        self.assertEqual(member.organization_id, inv.organization_id)

    async def test_expired_link_is_rejected(self):
        user = pending_user()
        inv = account_invitation(user, expires_at=datetime.now(timezone.utc) - timedelta(minutes=1))
        with patch.object(auth_service.organization_repository, "get_invitation_by_code", AsyncMock(return_value=inv)):
            with self.assertRaises(HTTPException) as ctx:
                await auth_service.activate_account(MagicMock(), "code", self._payload())
        self.assertEqual(ctx.exception.status_code, 410)
        self.assertFalse(user.is_active)

    async def test_in_app_invitation_code_cannot_activate(self):
        user = pending_user()
        inv = account_invitation(user, kind="existing_user")
        with patch.object(auth_service.organization_repository, "get_invitation_by_code", AsyncMock(return_value=inv)):
            with self.assertRaises(HTTPException) as ctx:
                await auth_service.get_activation_info(MagicMock(), "code")
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
