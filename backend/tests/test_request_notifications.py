from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.constants import request_execution as C
from app.constants import request_workflow as W
from app.services import notification_service
from app.services import request_lifecycle_service as lifecycle


def _member(role_tag: str) -> SimpleNamespace:
    return SimpleNamespace(role_tag=role_tag, user_id=uuid.uuid4())


def _request(**overrides) -> SimpleNamespace:
    data = dict(
        id=7,
        title="Баннер для акции",
        organization_id=uuid.uuid4(),
        workflow_status=W.WF_NEW,
        status=C.LEGACY_OPEN,
        created_by_user_id=uuid.uuid4(),
        responsible_user_id=None,
        stages=[],
        updated_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _recipients(create_notification: AsyncMock) -> dict[uuid.UUID, str]:
    return {
        call.kwargs["recipient_user_id"]: call.kwargs["notification_type"]
        for call in create_notification.await_args_list
    }


class RequestCreatedTests(unittest.IsolatedAsyncioTestCase):
    async def _notify(self, req, members, *, actor_user_id):
        with (
            patch.object(notification_service.organization_repository, "list_members", AsyncMock(return_value=members)),
            patch.object(notification_service, "create_notification", AsyncMock()) as create,
        ):
            await notification_service.notify_request_created(MagicMock(), req, actor_user_id=actor_user_id)
        return create

    async def test_owners_get_new_request_and_author_gets_confirmation(self):
        owner, member = _member("owner"), _member("member")
        req = _request()
        create = await self._notify(req, [owner, member], actor_user_id=req.created_by_user_id)
        self.assertEqual(
            _recipients(create),
            {owner.user_id: "request_created", req.created_by_user_id: "request_submitted"},
        )

    async def test_owner_author_gets_only_confirmation(self):
        owner = _member("owner")
        req = _request(created_by_user_id=owner.user_id)
        create = await self._notify(req, [owner], actor_user_id=owner.user_id)
        self.assertEqual(_recipients(create), {owner.user_id: "request_submitted"})

    async def test_public_request_notifies_owners_only(self):
        owner = _member("owner")
        req = _request(created_by_user_id=None)
        create = await self._notify(req, [owner], actor_user_id=None)
        self.assertEqual(_recipients(create), {owner.user_id: "request_created"})

    async def test_draft_is_silent(self):
        create = await self._notify(_request(workflow_status=W.WF_DRAFT), [_member("owner")], actor_user_id=None)
        create.assert_not_awaited()


class AuthorMilestoneTests(unittest.IsolatedAsyncioTestCase):
    async def test_author_is_not_notified_about_own_action(self):
        req = _request()
        with patch.object(notification_service, "create_notification", AsyncMock()) as create:
            await notification_service.notify_request_author(
                MagicMock(), req, actor_user_id=req.created_by_user_id,
                notification_type="request_closed", title="t",
            )
        create.assert_not_awaited()

    async def test_take_notifies_author_once_even_if_author_is_owner(self):
        owner_author, other_owner = _member("owner"), _member("owner")
        req = _request(created_by_user_id=owner_author.user_id)
        actor = SimpleNamespace(id=uuid.uuid4())
        member = SimpleNamespace(role_tag="member", user_id=actor.id)
        session = MagicMock()
        session.commit = AsyncMock()
        with (
            patch.object(lifecycle.perms, "load_request_with_access", AsyncMock(return_value=(req, member))),
            patch.object(lifecycle.request_execution_service, "lock_request_for_update", AsyncMock(return_value=req)),
            patch.object(lifecycle.request_execution_service, "append_event", AsyncMock()),
            patch.object(lifecycle.organization_repository, "list_members", AsyncMock(return_value=[owner_author, other_owner])),
            patch.object(lifecycle.request_repository, "update", AsyncMock(return_value=req)),
            patch.object(lifecycle.request_repository, "get_by_id", AsyncMock(return_value=req)),
            patch.object(notification_service, "create_notification", AsyncMock()) as create,
        ):
            await lifecycle.take_request(session, req.id, actor)

        self.assertEqual(
            _recipients(create),
            {other_owner.user_id: "request_taken", owner_author.user_id: "request_in_work"},
        )
        self.assertEqual(create.await_count, 2)


if __name__ == "__main__":
    unittest.main()
