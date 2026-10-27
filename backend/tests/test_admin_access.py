from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app import billing_cli
from app.api import deps
from app.constants.roles import ROLE_ADMIN, ROLE_USER
from app.services import auth_service


def user(**overrides):
    data = dict(
        id=uuid.uuid4(),
        email="Anna@Example.com",
        first_name="Анна",
        last_name="Иванова",
        middle_name=None,
        phone_number="+79990000000",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        email_verified_at=None,
        is_active=True,
        role=ROLE_USER,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


class AdminDependencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_admin_passes(self):
        admin = user(role=ROLE_ADMIN)

        self.assertIs(await deps.get_admin_user(admin), admin)

    async def test_everyone_else_gets_403(self):
        for role in (ROLE_USER, None, "", "ADMIN", "superadmin"):
            with self.subTest(role=role):
                with self.assertRaises(HTTPException) as ctx:
                    await deps.get_admin_user(user(role=role))
                self.assertEqual(ctx.exception.status_code, 403)


class ProfileRoleTests(unittest.TestCase):
    def build(self, **overrides):
        with patch.object(auth_service.email_service, "is_configured", return_value=False):
            return auth_service.build_profile_response(user(**overrides), None, None)

    def test_profile_carries_the_platform_role(self):
        self.assertEqual(self.build().role, "user")
        self.assertEqual(self.build(role=ROLE_ADMIN).role, "admin")

    def test_profile_never_exposes_the_password_hash(self):
        dumped = self.build(password_hash="secret").model_dump()

        self.assertNotIn("password_hash", dumped)
        self.assertNotIn("secret", str(dumped))


class MakeAdminTests(unittest.IsolatedAsyncioTestCase):
    def lookup(self, found):
        patcher = patch.object(
            billing_cli.user_repository, "get_by_email_ignore_case", AsyncMock(return_value=found)
        )
        mock = patcher.start()
        self.addCleanup(patcher.stop)
        return mock

    async def test_account_becomes_admin(self):
        account = user()
        lookup = self.lookup(account)

        result, changed = await billing_cli.make_admin(MagicMock(), "  anna@example.com ")

        self.assertIs(result, account)
        self.assertTrue(changed)
        self.assertEqual(account.role, ROLE_ADMIN)
        # The address is typed by hand: surrounding spaces are dropped before the search
        self.assertEqual(lookup.await_args.args[1], "anna@example.com")

    async def test_admin_stays_admin_and_nothing_changes(self):
        account = user(role=ROLE_ADMIN)
        self.lookup(account)

        _, changed = await billing_cli.make_admin(MagicMock(), "anna@example.com")

        self.assertFalse(changed)

    async def test_unknown_address_is_an_error(self):
        self.lookup(None)

        with self.assertRaises(billing_cli.CliError):
            await billing_cli.make_admin(MagicMock(), "nobody@example.com")

    async def test_disabled_account_cannot_become_admin(self):
        account = user(is_active=False)
        self.lookup(account)

        with self.assertRaises(billing_cli.CliError):
            await billing_cli.make_admin(MagicMock(), "anna@example.com")

        self.assertEqual(account.role, ROLE_USER)


class CliEntryPointTests(unittest.TestCase):
    def test_make_admin_command_commits_and_reports(self):
        account = user()
        session = MagicMock()
        session.commit = AsyncMock()
        factory = MagicMock()
        factory.return_value.__aenter__ = AsyncMock(return_value=session)
        factory.return_value.__aexit__ = AsyncMock(return_value=False)
        with (
            patch.object(billing_cli, "async_session_factory", factory),
            patch.object(billing_cli, "engine", MagicMock(dispose=AsyncMock())),
            patch.object(billing_cli, "make_admin", AsyncMock(return_value=(account, True))),
            patch("builtins.print") as printed,
        ):
            code = billing_cli.main(["make-admin", "anna@example.com"])

        self.assertEqual(code, 0)
        session.commit.assert_awaited_once()
        self.assertIn("теперь администратор", printed.call_args.args[0])

    def test_error_is_reported_with_a_failing_exit_code(self):
        factory = MagicMock()
        factory.return_value.__aenter__ = AsyncMock(return_value=MagicMock())
        factory.return_value.__aexit__ = AsyncMock(return_value=False)
        with (
            patch.object(billing_cli, "async_session_factory", factory),
            patch.object(billing_cli, "engine", MagicMock(dispose=AsyncMock())),
            patch.object(
                billing_cli, "make_admin", AsyncMock(side_effect=billing_cli.CliError("нет такого"))
            ),
            patch("builtins.print"),
        ):
            code = billing_cli.main(["make-admin", "nobody@example.com"])

        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
