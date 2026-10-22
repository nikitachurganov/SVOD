from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.core.config import settings
from app.models.telegram import TelegramAccount
from app.services import telegram_link_service as link


def _session():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


class CreateLinkTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_bot_is_unavailable(self):
        with patch.object(settings, "TELEGRAM_BOT_TOKEN", ""):
            with self.assertRaises(HTTPException) as ctx:
                await link.create_link(_session(), SimpleNamespace(id=uuid.uuid4()))
        self.assertEqual(ctx.exception.status_code, 503)

    async def test_link_carries_token_and_only_its_hash_is_stored(self):
        session = _session()
        user = SimpleNamespace(id=uuid.uuid4())
        with (
            patch.object(settings, "TELEGRAM_BOT_TOKEN", "123:abc"),
            patch.object(settings, "TELEGRAM_BOT_USERNAME", "@svod_bot"),
            patch.object(link.telegram_repository, "add_link_token", AsyncMock()) as add_token,
        ):
            response = await link.create_link(session, user)

        self.assertTrue(response.url.startswith("https://t.me/svod_bot?start="))
        token = response.url.split("start=", 1)[1]
        stored = add_token.await_args.args[1]
        self.assertEqual(stored.user_id, user.id)
        self.assertEqual(stored.token_hash, link._hash_token(token))
        self.assertNotEqual(stored.token_hash, token)
        self.assertLessEqual(len(token), 64)
        session.commit.assert_awaited_once()


class ConsumeTokenTests(unittest.IsolatedAsyncioTestCase):
    def _token_row(self, **overrides):
        data = dict(
            user_id=uuid.uuid4(),
            used_at=None,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        )
        data.update(overrides)
        return SimpleNamespace(**data)

    async def _consume(self, row, *, user=None, by_telegram=None, by_user=None):
        session = _session()
        user = user or SimpleNamespace(id=row.user_id if row else uuid.uuid4(), is_active=True)
        with (
            patch.object(link.telegram_repository, "get_link_token_for_update", AsyncMock(return_value=row)),
            patch.object(link.user_repository, "get_by_id", AsyncMock(return_value=user)),
            patch.object(link.telegram_repository, "get_account_by_telegram_id", AsyncMock(return_value=by_telegram)),
            patch.object(link.telegram_repository, "get_account_by_user", AsyncMock(return_value=by_user)),
            patch.object(link.telegram_repository, "delete_account", AsyncMock()) as delete_account,
        ):
            result = await link.consume_link_token(
                session, "token", telegram_user_id=42, username="ivan", display_name="Иван"
            )
        return result, session, delete_account

    async def test_unknown_used_or_expired_tokens_are_rejected(self):
        expired = self._token_row(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
        used = self._token_row(used_at=datetime.now(timezone.utc))
        for row in (None, expired, used):
            result, session, _ = await self._consume(row)
            self.assertIsNone(result)
            session.add.assert_not_called()

    async def test_inactive_user_is_rejected(self):
        row = self._token_row()
        result, session, _ = await self._consume(row, user=SimpleNamespace(id=row.user_id, is_active=False))
        self.assertIsNone(result)
        session.add.assert_not_called()

    async def test_valid_token_links_account_and_is_consumed(self):
        row = self._token_row()
        result, session, delete_account = await self._consume(row)

        self.assertEqual(result.id, row.user_id)
        self.assertIsNotNone(row.used_at)
        account = session.add.call_args.args[0]
        self.assertIsInstance(account, TelegramAccount)
        self.assertEqual(account.telegram_user_id, 42)
        self.assertEqual(account.user_id, row.user_id)
        delete_account.assert_not_awaited()
        session.commit.assert_awaited_once()

    async def test_previous_bindings_of_both_sides_are_replaced_once(self):
        row = self._token_row()
        same = SimpleNamespace(id=uuid.uuid4())
        _, _, delete_account = await self._consume(row, by_telegram=same, by_user=same)
        self.assertEqual(delete_account.await_count, 1)

        other_tg = SimpleNamespace(id=uuid.uuid4())
        other_user = SimpleNamespace(id=uuid.uuid4())
        _, _, delete_account = await self._consume(
            self._token_row(), by_telegram=other_tg, by_user=other_user
        )
        self.assertEqual(delete_account.await_count, 2)


if __name__ == "__main__":
    unittest.main()
