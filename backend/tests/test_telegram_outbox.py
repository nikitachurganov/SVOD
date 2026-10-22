from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from aiogram.exceptions import (
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramNetworkError,
)
from fastapi import HTTPException

from app.core.config import settings
from app.telegram import keyboards, loops, texts


def _notification(**overrides):
    data = dict(
        id=uuid.uuid4(),
        request_id=5,
        stage_id=None,
        type="request_created",
        title="Новая заявка № 5",
        body="Макет <баннера>",
        telegram_sent_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _account():
    return SimpleNamespace(user_id=uuid.uuid4(), telegram_user_id=1001, blocked_at=None)


class OutboxTests(unittest.IsolatedAsyncioTestCase):
    async def _deliver(self, rows, send_side_effect=None):
        session = MagicMock()
        session.commit = AsyncMock()
        bot = MagicMock()
        bot.send_message = AsyncMock(side_effect=send_side_effect)
        with patch.object(loops.telegram_repository, "claim_pending_notifications", AsyncMock(return_value=rows)):
            processed = await loops.deliver_notification_batch(session, bot)
        return processed, bot, session

    async def test_sent_notifications_are_marked(self):
        rows = [(_notification(), _account()), (_notification(), _account())]
        processed, bot, session = await self._deliver(rows)
        self.assertEqual(processed, 2)
        self.assertEqual(bot.send_message.await_count, 2)
        self.assertTrue(all(n.telegram_sent_at is not None for n, _ in rows))
        session.commit.assert_awaited_once()

    async def test_blocked_bot_marks_account_and_skips_notification(self):
        rows = [(_notification(), _account())]
        error = TelegramForbiddenError(method=MagicMock(), message="bot was blocked by the user")
        processed, _, _ = await self._deliver(rows, send_side_effect=error)
        notification, account = rows[0]
        self.assertEqual(processed, 1)
        self.assertIsNotNone(account.blocked_at)
        self.assertIsNotNone(notification.telegram_sent_at)

    async def test_bad_request_is_not_retried(self):
        rows = [(_notification(), _account())]
        error = TelegramBadRequest(method=MagicMock(), message="chat not found")
        await self._deliver(rows, send_side_effect=error)
        self.assertIsNotNone(rows[0][0].telegram_sent_at)

    async def test_network_error_leaves_rest_pending(self):
        rows = [(_notification(), _account()), (_notification(), _account())]
        error = TelegramNetworkError(method=MagicMock(), message="timeout")
        processed, bot, session = await self._deliver(rows, send_side_effect=error)
        self.assertEqual(processed, 0)
        self.assertEqual(bot.send_message.await_count, 1)
        self.assertTrue(all(n.telegram_sent_at is None for n, _ in rows))
        session.commit.assert_awaited_once()


class FormattingTests(unittest.TestCase):
    def test_notification_text_escapes_html(self):
        with patch.object(settings, "APP_PUBLIC_URL", "https://app.svodservice.ru"):
            text = texts.notification_text(_notification())
        self.assertIn("&lt;баннера&gt;", text)
        self.assertNotIn("https://", text)

    def test_localhost_link_goes_to_text_instead_of_button(self):
        with patch.object(settings, "APP_PUBLIC_URL", "http://localhost:5173"):
            text = texts.notification_text(_notification())
            markup = keyboards.notification_keyboard(_notification())
        self.assertIn("http://localhost:5173/requests/5", text)
        buttons = [b for row in markup.inline_keyboard for b in row]
        self.assertEqual([b.text for b in buttons], ["Взять в работу"])

    def test_keyboard_actions_by_type(self):
        with patch.object(settings, "APP_PUBLIC_URL", "https://app.svodservice.ru"):
            created = keyboards.notification_keyboard(_notification())
            started = keyboards.notification_keyboard(
                _notification(type="stage_started", stage_id=uuid.uuid4())
            )
            closed = keyboards.notification_keyboard(_notification(type="request_closed"))
            no_request = keyboards.notification_keyboard(_notification(request_id=None))

        def texts_of(markup):
            return [b.text for row in markup.inline_keyboard for b in row]

        self.assertEqual(texts_of(created), ["Открыть в СВОД", "Взять в работу"])
        self.assertEqual(texts_of(started), ["Открыть в СВОД", "Завершить этап"])
        self.assertEqual(texts_of(closed), ["Открыть в СВОД"])
        self.assertIsNone(no_request)
        for markup in (created, started):
            for row in markup.inline_keyboard:
                for button in row:
                    if button.callback_data:
                        self.assertLessEqual(len(button.callback_data.encode()), 64)

    def test_service_errors_are_russian(self):
        self.assertEqual(
            texts.service_error(HTTPException(status_code=409, detail="Заявку уже взяли в работу")),
            "Заявку уже взяли в работу",
        )
        self.assertEqual(
            texts.service_error(HTTPException(status_code=403, detail="Only the owner")),
            "Недостаточно прав для этого действия",
        )


if __name__ == "__main__":
    unittest.main()
