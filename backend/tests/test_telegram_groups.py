from __future__ import annotations

import json
import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import telegram_group_service as groups
from app.services.telegram_group_service import GroupError
from app.telegram import loops


def _message(message_id: int, text: str, **overrides):
    data = dict(
        chat_id=-100500,
        message_id=message_id,
        from_name="Анна",
        text=text,
        attachments=None,
        sent_at=datetime(2026, 9, 29, 10, message_id % 60, tzinfo=timezone.utc),
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _chat(**overrides):
    data = dict(
        chat_id=-100500,
        organization_id=uuid.uuid4(),
        title="Маркетинг",
        last_analyzed_message_id=None,
        is_active=True,
        paused=False,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _session():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


class ParseDetectionTests(unittest.TestCase):
    def test_filters_low_confidence_unknown_ids_and_foreign_same_as(self):
        open_id = uuid.uuid4()
        raw = json.dumps(
            {
                "requests": [
                    {"title": "Баннер", "message_ids": [1, 2, 99], "same_as": None, "confidence": 0.9},
                    {"title": "Шутка", "message_ids": [3], "same_as": None, "confidence": 0.2},
                    {"title": "Буклеты", "message_ids": ["4"], "same_as": str(open_id), "confidence": 0.8},
                    {"title": "Чужое", "message_ids": [5], "same_as": str(uuid.uuid4()), "confidence": 0.7},
                    {"title": "Лишнее", "message_ids": [6], "confidence": 0.95},
                ]
            },
            ensure_ascii=False,
        )
        detected = groups.parse_detection(
            raw, known_message_ids={1, 2, 3, 4, 5, 6}, open_suggestion_ids={open_id}
        )
        self.assertEqual([d.title for d in detected], ["Баннер", "Буклеты", "Чужое"])
        self.assertEqual(detected[0].message_ids, [1, 2])
        self.assertEqual(detected[1].same_as, open_id)
        self.assertIsNone(detected[2].same_as)

    def test_garbage_means_no_requests(self):
        for raw in ("", "нет заявок", '{"requests": "none"}', "[1, 2]"):
            self.assertEqual(groups.parse_detection(raw, known_message_ids={1}, open_suggestion_ids=set()), [])


class AnalyzeChatTests(unittest.IsolatedAsyncioTestCase):
    def _patches(self, *, new, context=(), open_suggestions=(), llm=None):
        return (
            patch.object(groups.telegram_repository, "list_messages_after", AsyncMock(return_value=list(new))),
            patch.object(groups.telegram_repository, "list_messages_up_to", AsyncMock(return_value=list(context))),
            patch.object(
                groups.telegram_repository,
                "list_pending_suggestions_for_chat",
                AsyncMock(return_value=list(open_suggestions)),
            ),
            patch.object(groups, "post_chat_completion", llm or AsyncMock(return_value='{"requests": []}')),
        )

    async def test_nothing_new_is_a_no_op(self):
        p = self._patches(new=[])
        with p[0], p[1], p[2], p[3] as llm:
            self.assertEqual(await groups.analyze_chat(_session(), _chat()), [])
        llm.assert_not_awaited()

    async def test_cursor_moves_even_when_llm_fails(self):
        chat = _chat(last_analyzed_message_id=10)
        new = [_message(11, "привет"), _message(12, "нужен баннер")]
        p = self._patches(new=new, llm=AsyncMock(side_effect=RuntimeError("down")))
        with p[0], p[1], p[2], p[3]:
            self.assertEqual(await groups.analyze_chat(_session(), chat), [])
        self.assertEqual(chat.last_analyzed_message_id, 12)

    async def test_new_and_continued_requests(self):
        chat = _chat()
        existing = SimpleNamespace(id=uuid.uuid4(), title="Буклеты")
        new = [_message(1, "сделайте баннер 3х6"), _message(2, "к пятнице"), _message(3, "буклетов нужно 700")]
        answer = json.dumps(
            {
                "requests": [
                    {"title": "Баннер", "message_ids": [1, 2], "same_as": None, "confidence": 0.9},
                    {"title": "Буклеты", "message_ids": [3], "same_as": str(existing.id), "confidence": 0.8},
                ]
            }
        )
        created = SimpleNamespace(id=uuid.uuid4())
        p = self._patches(new=new, open_suggestions=[existing], llm=AsyncMock(return_value=answer))
        with (
            p[0], p[1], p[2], p[3],
            patch.object(groups, "create_group_suggestion", AsyncMock(return_value=created)) as create,
            patch.object(groups, "_extend_suggestion", AsyncMock(return_value=existing)) as extend,
        ):
            results = await groups.analyze_chat(_session(), chat)

        self.assertEqual(results, [(created, True), (existing, False)])
        self.assertEqual([m.message_id for m in create.await_args.args[2]], [1, 2])
        self.assertEqual([m.message_id for m in extend.await_args.args[2]], [3])


class GroupSuggestionTests(unittest.IsolatedAsyncioTestCase):
    async def test_dialog_becomes_transcript_and_moves_the_cursor(self):
        chat = _chat(last_analyzed_message_id=3)
        photo = {"file_id": "f1", "kind": "photo", "name": "photo_5.jpg", "mime": "image/jpeg", "size": 10}
        messages = [_message(4, "нужен баннер"), _message(5, "вот макет", attachments=[photo])]
        with patch.object(
            groups.telegram_suggestion_service, "create_suggestion", AsyncMock(return_value=SimpleNamespace())
        ) as create:
            await groups.create_group_suggestion(_session(), chat, messages, extra_text="срочно")

        kwargs = create.await_args.kwargs
        self.assertEqual(kwargs["source_kind"], "group")
        self.assertEqual(kwargs["telegram_chat_id"], chat.chat_id)
        self.assertIn("Анна (29.09 10:04): нужен баннер", kwargs["source_text"])
        self.assertTrue(kwargs["source_text"].endswith("Уточнение: срочно"))
        self.assertEqual([t["message_id"] for t in kwargs["transcript"]], [4, 5])
        self.assertEqual(kwargs["attachments"], [photo])
        self.assertEqual(chat.last_analyzed_message_id, 5)


class ConnectTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_owner_connects(self):
        with patch.object(
            groups.organization_repository, "get_member", AsyncMock(return_value=SimpleNamespace(role_tag="member"))
        ):
            with self.assertRaises(GroupError):
                await groups.connect_chat(
                    _session(), chat_id=-1, title="t", organization_id=uuid.uuid4(), user=SimpleNamespace(id=uuid.uuid4())
                )

    async def test_moving_group_to_another_org_drops_old_dialog(self):
        chat = _chat(last_analyzed_message_id=40)
        new_org = uuid.uuid4()
        user = SimpleNamespace(id=uuid.uuid4())
        with (
            patch.object(groups.organization_repository, "get_member", AsyncMock(return_value=SimpleNamespace(role_tag="owner"))),
            patch.object(groups.telegram_repository, "get_chat", AsyncMock(return_value=chat)),
            patch.object(groups.telegram_repository, "delete_messages", AsyncMock()) as delete_messages,
        ):
            await groups.connect_chat(_session(), chat_id=chat.chat_id, title="Новое", organization_id=new_org, user=user)

        delete_messages.assert_awaited_once()
        self.assertEqual(chat.organization_id, new_org)
        self.assertIsNone(chat.last_analyzed_message_id)
        self.assertEqual(chat.connected_by_user_id, user.id)


class GroupLoopTests(unittest.IsolatedAsyncioTestCase):
    async def test_new_cards_are_posted_and_continued_ones_refreshed(self):
        chat = _chat()
        new_card, old_card = SimpleNamespace(id=1), SimpleNamespace(id=2)
        session = _session()
        factory = MagicMock()
        factory.return_value.__aenter__ = AsyncMock(return_value=session)
        factory.return_value.__aexit__ = AsyncMock(return_value=False)
        with (
            patch.object(loops, "async_session_factory", factory),
            patch.object(loops.telegram_repository, "list_chat_ids_ready_for_analysis", AsyncMock(return_value=[chat.chat_id])),
            patch.object(loops.telegram_repository, "get_chat", AsyncMock(return_value=chat)),
            patch.object(
                loops.telegram_group_service,
                "analyze_chat",
                AsyncMock(return_value=[(new_card, True), (old_card, False)]),
            ),
            patch.object(loops.cards, "post_card", AsyncMock()) as post_card,
            patch.object(loops.cards, "refresh_card", AsyncMock()) as refresh_card,
        ):
            shown = await loops.analyze_ready_chats(MagicMock())

        self.assertEqual(shown, 2)
        self.assertIs(post_card.await_args.args[2], new_card)
        self.assertIs(refresh_card.await_args.args[1], old_card)


if __name__ == "__main__":
    unittest.main()
