from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.constants import request_execution as C
from app.constants import request_workflow as W
from app.services import request_lifecycle_service as lifecycle
from app.services import request_permissions as permissions


def new_request(**overrides):
    data = dict(
        id=1,
        title="Test request",
        organization_id=uuid.uuid4(),
        workflow_status=W.WF_NEW,
        status=C.LEGACY_OPEN,
        responsible_user_id=None,
        created_by_user_id=None,
        stages=[],
        priority=W.PRIORITY_MEDIUM,
        due_date=None,
        updated_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


MEMBER = SimpleNamespace(role_tag="member", user_id=uuid.uuid4())


class TakePermissionTests(unittest.TestCase):
    def test_member_can_take_only_free_new_request(self):
        self.assertTrue(permissions.can_take_request(new_request(), MEMBER))
        self.assertFalse(permissions.can_take_request(new_request(), None))
        self.assertFalse(
            permissions.can_take_request(new_request(responsible_user_id=uuid.uuid4()), MEMBER)
        )
        self.assertFalse(
            permissions.can_take_request(new_request(workflow_status=W.WF_PLANNING), MEMBER)
        )

    def test_release_only_by_responsible_in_planning(self):
        user = SimpleNamespace(id=uuid.uuid4())
        planning = new_request(workflow_status=W.WF_PLANNING, responsible_user_id=user.id)
        self.assertTrue(permissions.can_release_request(planning, user))
        self.assertFalse(permissions.can_release_request(planning, SimpleNamespace(id=uuid.uuid4())))
        started = new_request(workflow_status=W.WF_IN_PROGRESS, responsible_user_id=user.id)
        self.assertFalse(permissions.can_release_request(started, user))


class TakeReleaseCommandTests(unittest.IsolatedAsyncioTestCase):
    def _patches(self, req):
        return (
            patch.object(lifecycle.perms, "load_request_with_access", AsyncMock(return_value=(req, MEMBER))),
            patch.object(lifecycle.request_execution_service, "lock_request_for_update", AsyncMock(return_value=req)),
            patch.object(lifecycle.request_execution_service, "append_event", AsyncMock()),
            patch.object(lifecycle.organization_repository, "list_members", AsyncMock(return_value=[])),
            patch.object(lifecycle.request_repository, "update", AsyncMock(return_value=req)),
            patch.object(lifecycle.request_repository, "get_by_id", AsyncMock(return_value=req)),
        )

    async def test_take_makes_user_responsible_and_moves_to_planning(self):
        req = new_request()
        actor = SimpleNamespace(id=uuid.uuid4())
        session = MagicMock()
        session.commit = AsyncMock()
        p = self._patches(req)
        with p[0], p[1], p[2] as append_event, p[3], p[4], p[5]:
            await lifecycle.take_request(session, 1, actor)

        self.assertEqual(req.responsible_user_id, actor.id)
        self.assertEqual(req.workflow_status, W.WF_PLANNING)
        self.assertEqual(append_event.await_args.kwargs["event_type"], C.EVENT_REQUEST_TAKEN)

    async def test_take_already_taken_request_conflicts(self):
        req = new_request(responsible_user_id=uuid.uuid4())
        session = MagicMock()
        session.commit = AsyncMock()
        p = self._patches(req)
        with p[0], p[1], p[2], p[3], p[4], p[5]:
            with self.assertRaises(HTTPException) as ctx:
                await lifecycle.take_request(session, 1, SimpleNamespace(id=uuid.uuid4()))
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_release_returns_request_to_new_and_keeps_stages(self):
        actor = SimpleNamespace(id=uuid.uuid4())
        stages = [SimpleNamespace(id=uuid.uuid4())]
        req = new_request(workflow_status=W.WF_PLANNING, responsible_user_id=actor.id, stages=stages)
        session = MagicMock()
        session.commit = AsyncMock()
        p = self._patches(req)
        with p[0], p[1], p[2], p[3], p[4], p[5]:
            await lifecycle.release_request(session, 1, actor, reason="Нет компетенций")

        self.assertIsNone(req.responsible_user_id)
        self.assertEqual(req.workflow_status, W.WF_NEW)
        self.assertEqual(req.stages, stages)

    async def test_release_by_other_user_is_forbidden(self):
        req = new_request(workflow_status=W.WF_PLANNING, responsible_user_id=uuid.uuid4())
        session = MagicMock()
        session.commit = AsyncMock()
        p = self._patches(req)
        with p[0], p[1], p[2], p[3], p[4], p[5]:
            with self.assertRaises(HTTPException) as ctx:
                await lifecycle.release_request(session, 1, SimpleNamespace(id=uuid.uuid4()), reason="x")
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_priority_change_is_logged(self):
        actor = SimpleNamespace(id=uuid.uuid4())
        req = new_request(workflow_status=W.WF_PLANNING, responsible_user_id=actor.id)
        session = MagicMock()
        session.commit = AsyncMock()
        p = self._patches(req)
        with p[0], p[1], p[2] as append_event, p[3], p[4], p[5]:
            await lifecycle.update_attributes(
                session, 1, actor, fields={"priority"}, priority=W.PRIORITY_HIGH, due_date=None
            )
        self.assertEqual(req.priority, W.PRIORITY_HIGH)
        self.assertEqual(append_event.await_args.kwargs["event_type"], C.EVENT_PRIORITY_CHANGED)


if __name__ == "__main__":
    unittest.main()
