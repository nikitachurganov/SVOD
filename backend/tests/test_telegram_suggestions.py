from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import telegram_suggestion_service as suggestions
from app.services.telegram_suggestion_service import SuggestionError


def _suggestion(**overrides):
    data = dict(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        source_kind=suggestions.SOURCE_PRIVATE,
        initiator_user_id=uuid.uuid4(),
        status=suggestions.STATUS_PENDING,
        request_id=None,
        title="Буклеты",
        summary="Нужно 500 буклетов",
        priority="high",
        form_id=uuid.uuid4(),
        data={"details": "Нужно 500 буклетов"},
        form_snapshot={"fields": []},
        decided_by_user_id=None,
        decided_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


class LoadForActionTests(unittest.IsolatedAsyncioTestCase):
    async def _load(self, suggestion, *, user, member=True):
        with (
            patch.object(suggestions.telegram_repository, "get_suggestion_for_update", AsyncMock(return_value=suggestion)),
            patch.object(
                suggestions.organization_repository,
                "get_member",
                AsyncMock(return_value=SimpleNamespace() if member else None),
            ),
        ):
            return await suggestions.load_for_action(MagicMock(), uuid.uuid4(), user)

    async def test_private_draft_belongs_to_its_author(self):
        suggestion = _suggestion()
        author = SimpleNamespace(id=suggestion.initiator_user_id)
        self.assertIs(await self._load(suggestion, user=author), suggestion)
        with self.assertRaises(SuggestionError):
            await self._load(suggestion, user=SimpleNamespace(id=uuid.uuid4()))

    async def test_group_draft_is_open_to_any_member(self):
        suggestion = _suggestion(source_kind=suggestions.SOURCE_GROUP, initiator_user_id=None)
        member = SimpleNamespace(id=uuid.uuid4())
        self.assertIs(await self._load(suggestion, user=member), suggestion)
        with self.assertRaises(SuggestionError):
            await self._load(suggestion, user=member, member=False)

    async def test_processed_drafts_are_rejected(self):
        user = SimpleNamespace(id=uuid.uuid4())
        with self.assertRaisesRegex(SuggestionError, "№ 12"):
            await self._load(_suggestion(status=suggestions.STATUS_CREATED, request_id=12), user=user)
        with self.assertRaises(SuggestionError):
            await self._load(_suggestion(status=suggestions.STATUS_DISMISSED), user=user)
        with self.assertRaises(SuggestionError):
            await self._load(None, user=user)


class ConfirmTests(unittest.IsolatedAsyncioTestCase):
    async def test_confirm_creates_telegram_request(self):
        suggestion = _suggestion()
        user = SimpleNamespace(id=suggestion.initiator_user_id)
        session = MagicMock()
        session.commit = AsyncMock()
        with patch.object(
            suggestions.request_service, "create_request", AsyncMock(return_value=SimpleNamespace(id="41"))
        ) as create_request:
            request_id = await suggestions.confirm(session, suggestion, user)

        self.assertEqual(request_id, 41)
        self.assertEqual(suggestion.request_id, 41)
        self.assertEqual(suggestion.status, suggestions.STATUS_CREATED)
        self.assertEqual(suggestion.decided_by_user_id, user.id)
        payload = create_request.await_args.args[1]
        self.assertEqual(payload.form_id, str(suggestion.form_id))
        self.assertEqual(payload.organization_id, str(suggestion.organization_id))
        self.assertEqual(payload.data, suggestion.data)
        self.assertEqual(create_request.await_args.kwargs, {"source": "telegram", "priority": "high"})

    async def test_confirm_without_form_is_refused(self):
        with self.assertRaises(SuggestionError):
            await suggestions.confirm(MagicMock(), _suggestion(form_id=None), SimpleNamespace(id=uuid.uuid4()))


class UpdateTextTests(unittest.IsolatedAsyncioTestCase):
    async def test_summary_edit_also_updates_its_copy_in_form_data(self):
        suggestion = _suggestion(data={"details": "Нужно 500 буклетов", "subject": "Буклеты"})
        session = MagicMock()
        session.commit = AsyncMock()
        await suggestions.update_text(session, suggestion, title="Буклеты A3", summary="Нужно 700 буклетов")
        self.assertEqual(suggestion.title, "Буклеты A3")
        self.assertEqual(suggestion.data, {"details": "Нужно 700 буклетов", "subject": "Буклеты"})


class MessageUrlTests(unittest.TestCase):
    def test_links_only_for_supergroups(self):
        self.assertEqual(suggestions.message_url(-1001234567890, 55), "https://t.me/c/1234567890/55")
        self.assertIsNone(suggestions.message_url(-4567, 55))
        self.assertIsNone(suggestions.message_url(None, 55))


if __name__ == "__main__":
    unittest.main()
