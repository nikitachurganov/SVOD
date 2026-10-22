"""Routing smoke tests: real aiogram dispatcher, fake Telegram API session, mocked services."""

from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from aiogram import Bot
from aiogram.client.session.base import BaseSession
from aiogram.types import CallbackQuery, Chat, Message, Update, User

from app.telegram import middlewares
from app.telegram.bot import build_dispatcher
from app.telegram.handlers import group, private, suggestions
from app.telegram.keyboards import SuggestionAction

NOW = datetime(2026, 9, 29, 12, 0, tzinfo=timezone.utc)
PRIVATE = Chat(id=100, type="private")
GROUP = Chat(id=-100500, type="supergroup", title="Маркетинг")
IVAN = User(id=100, is_bot=False, first_name="Иван")

# Routers are module singletons and attach to a single dispatcher
DISPATCHER = build_dispatcher()


class FakeTelegram(BaseSession):
    """Records Bot API calls and answers with plausible objects."""

    def __init__(self) -> None:
        super().__init__()
        self.calls: list = []

    async def make_request(self, bot, method, timeout=None):
        self.calls.append(method)
        name = type(method).__name__
        if name == "GetMe":
            return User(id=42, is_bot=True, first_name="СВОД", username="svod_bot", can_read_all_group_messages=True)
        if name in ("SendMessage", "EditMessageText"):
            chat_id = getattr(method, "chat_id", None) or PRIVATE.id
            chat = GROUP if chat_id == GROUP.id else PRIVATE
            # The real session mounts parsed results to the bot, so `message.edit_text()` works
            return Message(message_id=900 + len(self.calls), date=NOW, chat=chat, text=method.text).as_(bot)
        return True

    async def stream_content(self, *args, **kwargs):  # pragma: no cover - not used
        yield b""

    async def close(self) -> None:
        pass

    def texts(self, method_name: str) -> list[str]:
        return [c.text for c in self.calls if type(c).__name__ == method_name]


def _message(text: str, *, chat: Chat = PRIVATE, message_id: int = 1, reply_to: Message | None = None) -> Message:
    return Message(
        message_id=message_id, date=NOW, chat=chat, from_user=IVAN, text=text, reply_to_message=reply_to
    )


def _suggestion(**overrides):
    data = dict(
        id=uuid.uuid4(),
        source_kind="private",
        title="Баннер 3x6",
        summary="Нужен баннер к пятнице",
        form_name="Печать",
        priority="high",
        data={"details": "..."},
        missing_required=[],
        attachments=None,
        status="pending",
        request_id=None,
        form_choices=[{"id": str(uuid.uuid4()), "name": "Печать"}],
        transcript=None,
        card_chat_id=None,
        card_message_id=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


class HandlerRoutingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.api = FakeTelegram()
        self.bot = Bot("42:TEST", session=self.api)
        self.dp = DISPATCHER
        self.dp.fsm.storage.storage.clear()
        self.db = MagicMock()
        self.db.commit = AsyncMock()
        self.db.rollback = AsyncMock()
        factory = MagicMock()
        factory.return_value.__aenter__ = AsyncMock(return_value=self.db)
        factory.return_value.__aexit__ = AsyncMock(return_value=False)
        patcher = patch.object(middlewares, "async_session_factory", factory)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.user = SimpleNamespace(id=uuid.uuid4(), full_name="Иван Петров")
        self.account = SimpleNamespace(blocked_at=None, current_organization_id=None)
        self.update_id = 0

    async def feed(self, *, message: Message | None = None, callback: CallbackQuery | None = None) -> None:
        self.update_id += 1
        await self.dp.feed_update(self.bot, Update(update_id=self.update_id, message=message, callback_query=callback))

    def linked(self):
        return patch.object(
            private.telegram_link_service, "get_linked_user", AsyncMock(return_value=(self.account, self.user))
        )

    async def test_start_without_link_explains_how_to_connect(self):
        with patch.object(private.telegram_link_service, "get_linked_user", AsyncMock(return_value=None)):
            await self.feed(message=_message("/start"))
        self.assertIn("Аккаунт СВОД не подключён", self.api.texts("SendMessage")[0])

    async def test_start_with_token_links_account(self):
        with patch.object(
            private.telegram_link_service, "consume_link_token", AsyncMock(return_value=self.user)
        ) as consume:
            await self.feed(message=_message("/start abcDEF_123"))
        self.assertEqual(consume.await_args.args[1], "abcDEF_123")
        self.assertIn("Иван Петров", self.api.texts("SendMessage")[0])

    async def test_new_request_flow_publishes_a_card(self):
        org = SimpleNamespace(id=uuid.uuid4(), name="Маркетинг")
        suggestion = _suggestion()
        with (
            self.linked(),
            patch.object(private.organization_repository, "get_orgs_for_user", AsyncMock(return_value=[org])),
            patch.object(
                private.telegram_suggestion_service, "create_suggestion", AsyncMock(return_value=suggestion)
            ) as create,
        ):
            await self.feed(message=_message("/new"))
            await self.feed(message=_message("Нужен баннер 3x6 к пятнице", message_id=2))

        self.assertEqual(create.await_args.kwargs["organization_id"], org.id)
        self.assertEqual(create.await_args.kwargs["source_text"], "Нужен баннер 3x6 к пятнице")
        self.assertIn("Баннер 3x6", self.api.texts("EditMessageText")[-1])
        self.assertIsNotNone(suggestion.card_message_id)

    async def test_create_button_confirms_the_draft(self):
        suggestion = _suggestion(card_chat_id=PRIVATE.id, card_message_id=5)

        async def confirm(session, s, user):
            s.status, s.request_id = "created", 77
            return 77

        callback = CallbackQuery(
            id="cb1",
            from_user=IVAN,
            chat_instance="ci",
            data=SuggestionAction(action="create", suggestion_id=suggestion.id).pack(),
            message=_message("card", message_id=5),
        )
        with (
            patch.object(suggestions.telegram_link_service, "get_linked_user", AsyncMock(return_value=(self.account, self.user))),
            patch.object(suggestions.telegram_suggestion_service, "load_for_action", AsyncMock(return_value=suggestion)),
            patch.object(suggestions.telegram_suggestion_service, "confirm", AsyncMock(side_effect=confirm)),
        ):
            await self.feed(callback=callback)

        answers = [c.text for c in self.api.calls if type(c).__name__ == "AnswerCallbackQuery"]
        self.assertEqual(answers, ["Создана заявка № 77"])
        self.assertIn("✅ Создана заявка № 77", self.api.texts("EditMessageText")[-1])

    async def test_group_messages_are_stored_and_request_uses_reply(self):
        chat = SimpleNamespace(chat_id=GROUP.id, is_active=True, organization_id=uuid.uuid4(), title="Маркетинг")
        with (
            patch.object(group.telegram_repository, "get_chat", AsyncMock(return_value=chat)),
            patch.object(group.telegram_group_service, "store_message", AsyncMock()) as store,
            patch.object(group.telegram_group_service, "context_messages", AsyncMock(return_value=[])),
            patch.object(group.telegram_link_service, "get_linked_user", AsyncMock(return_value=None)),
            patch.object(
                group.telegram_group_service,
                "create_group_suggestion",
                AsyncMock(return_value=_suggestion(source_kind="group")),
            ) as create,
        ):
            original = _message("Сделайте баннер 3x6 к пятнице", chat=GROUP, message_id=10)
            await self.feed(message=original)
            await self.feed(message=_message("/request", chat=GROUP, message_id=11, reply_to=original))

        self.assertEqual(store.await_args.kwargs["text"], "Сделайте баннер 3x6 к пятнице")
        messages = create.await_args.args[2]
        # The replied message was not in storage (mocked empty) — it is still used
        self.assertEqual([m.message_id for m in messages], [10])
        self.assertIn("Похоже на заявку", self.api.texts("EditMessageText")[-1])

    async def test_group_ignores_unconnected_chats(self):
        with (
            patch.object(group.telegram_repository, "get_chat", AsyncMock(return_value=None)),
            patch.object(group.telegram_group_service, "store_message", AsyncMock()) as store,
        ):
            await self.feed(message=_message("привет", chat=GROUP, message_id=3))
        store.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
