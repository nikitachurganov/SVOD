from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.constants import request_execution as C
from app.constants import request_workflow as W
from app.schemas.request_execution import CompleteStagePayload
from app.services import request_execution_service as execution
from app.services import request_permissions as permissions
from app.services import request_service
from app.services import stage_artifact_service
from app.services import stage_specification_service


def stage(sequence: int, status: str, *, assigned: bool = False):
    user_id = uuid.uuid4() if assigned else None
    return SimpleNamespace(
        id=uuid.uuid4(),
        request_id=1,
        sequence=sequence,
        title=f"Stage {sequence}",
        status=status,
        assignee_kind="internal" if assigned else "unassigned",
        assignee_internal_user_id=user_id,
        assignee_external_contractor_id=None,
        artifacts=[],
        started_at=None,
        completed_at=None,
        completed_by_user_id=None,
        result_summary=None,
        blocked_reason=None,
    )


def request_with(*stages):
    return SimpleNamespace(
        id=1,
        title="Test request",
        workflow_status=W.WF_IN_PROGRESS,
        status=C.LEGACY_ASSIGNED,
        stages=list(stages),
        responsible_user_id=uuid.uuid4(),
        created_by_user_id=None,
        assigned_kind=None,
        assigned_internal_user_id=None,
        assigned_external_contractor_id=None,
        execution_status=None,
        closed_at=None,
        updated_at=None,
    )


class DerivedExecutionTests(unittest.TestCase):
    def test_execution_status_tracks_strict_active_stage(self):
        self.assertEqual(execution.derive_execution_status([]), C.EXEC_NEW)
        self.assertEqual(
            execution.derive_execution_status(
                [stage(1, C.STAGE_DONE), stage(2, C.STAGE_BLOCKED)]
            ),
            C.EXEC_BLOCKED,
        )
        self.assertEqual(
            execution.derive_execution_status(
                [stage(1, C.STAGE_DONE), stage(2, C.STAGE_DONE)]
            ),
            C.EXEC_COMPLETED,
        )
        correction = stage(3, C.STAGE_PENDING)
        self.assertIs(
            execution.find_active_stage([stage(1, C.STAGE_DONE), correction]),
            correction,
        )

    def test_business_transition_vocabulary(self):
        self.assertIn(W.WF_COMPLETED, W.WORKFLOW_TRANSITIONS[W.WF_IN_PROGRESS])
        self.assertIn(W.WF_CLOSED, W.WORKFLOW_TRANSITIONS[W.WF_COMPLETED])
        self.assertNotIn(W.WF_CLOSED, W.WORKFLOW_TRANSITIONS[W.WF_IN_PROGRESS])

    def test_owner_responsible_and_assignee_permissions_are_distinct(self):
        owner = SimpleNamespace(id=uuid.uuid4())
        responsible = SimpleNamespace(id=uuid.uuid4())
        assignee = SimpleNamespace(id=uuid.uuid4())
        req = SimpleNamespace(responsible_user_id=responsible.id)
        current = stage(1, C.STAGE_IN_PROGRESS)
        current.assignee_kind = "internal"
        current.assignee_internal_user_id = assignee.id
        owner_member = SimpleNamespace(role_tag="owner")
        member = SimpleNamespace(role_tag="member")

        self.assertTrue(permissions.can_manage_request(req, owner, owner_member))
        self.assertTrue(permissions.can_manage_request(req, responsible, member))
        self.assertFalse(permissions.can_manage_request(req, assignee, member))
        self.assertTrue(permissions.can_act_on_stage(req, current, assignee, member))


class TimelineDossierTests(unittest.TestCase):
    def test_artifact_response_keeps_input_or_result_purpose(self):
        artifact = SimpleNamespace(
            id=uuid.uuid4(), kind="file", purpose="input", name="brief.pdf", url=None,
            content_type="application/pdf", size=12, created_by_user_id=None,
            created_at=SimpleNamespace(isoformat=lambda: "2026-01-01T00:00:00+00:00"),
        )
        response = stage_artifact_service.artifact_to_response(artifact)
        self.assertEqual(response.purpose, "input")

    def test_handoff_response_uses_frozen_snapshot_values(self):
        handoff = SimpleNamespace(
            id=uuid.uuid4(), specification_id=None, specification_version=3,
            specification_snapshot={"goal": "Frozen"}, assignee_kind="internal",
            assignee_id=uuid.uuid4(), assignee_name="Past performer",
            assigned_by_user_id=uuid.uuid4(), assigned_by_name="Coordinator",
            due_date=None, materials_snapshot=[{"name": "brief.pdf"}],
            assigned_at=SimpleNamespace(isoformat=lambda: "2026-01-02T00:00:00+00:00"),
        )
        response = stage_specification_service.handoff_to_response(handoff)
        self.assertEqual(response.assignee_name, "Past performer")
        self.assertEqual(response.specification_snapshot, {"goal": "Frozen"})
        self.assertEqual(response.materials_snapshot[0]["name"], "brief.pdf")


class StageCompletionTests(unittest.IsolatedAsyncioTestCase):
    async def test_next_assigned_stage_starts_automatically(self):
        current = stage(1, C.STAGE_IN_PROGRESS, assigned=True)
        next_stage = stage(2, C.STAGE_PENDING, assigned=True)
        req = request_with(current, next_stage)
        actor = SimpleNamespace(id=current.assignee_internal_user_id)
        session = MagicMock()
        session.commit = AsyncMock()

        with (
            patch.object(execution.perms, "load_request_with_access", AsyncMock(return_value=(req, SimpleNamespace(role_tag="member")))),
            patch.object(execution, "lock_request_for_update", AsyncMock(return_value=req)),
            patch.object(execution.perms, "can_act_on_stage", return_value=True),
            patch.object(execution.request_stage_repository, "get_stage", AsyncMock(return_value=current)),
            patch.object(execution.request_repository, "update", AsyncMock(return_value=req)),
            patch.object(execution, "_reload_request", AsyncMock(return_value=req)),
            patch.object(execution.notification_service, "create_notification", AsyncMock(return_value=True)),
            patch.object(execution.notification_service, "notify_stage_assignee", AsyncMock()),
        ):
            await execution.complete_stage(
                session,
                1,
                current.id,
                CompleteStagePayload(result_summary="Delivered"),
                actor,
            )

        self.assertEqual(current.status, C.STAGE_DONE)
        self.assertEqual(next_stage.status, C.STAGE_IN_PROGRESS)
        self.assertIsNotNone(next_stage.started_at)
        self.assertEqual(req.workflow_status, W.WF_IN_PROGRESS)

    async def test_last_stage_completes_request_but_does_not_close_it(self):
        current = stage(1, C.STAGE_IN_PROGRESS, assigned=True)
        req = request_with(current)
        actor = SimpleNamespace(id=current.assignee_internal_user_id)
        session = MagicMock()
        session.commit = AsyncMock()

        with (
            patch.object(execution.perms, "load_request_with_access", AsyncMock(return_value=(req, SimpleNamespace(role_tag="member")))),
            patch.object(execution, "lock_request_for_update", AsyncMock(return_value=req)),
            patch.object(execution.perms, "can_act_on_stage", return_value=True),
            patch.object(execution.request_stage_repository, "get_stage", AsyncMock(return_value=current)),
            patch.object(execution.request_repository, "update", AsyncMock(return_value=req)),
            patch.object(execution, "_reload_request", AsyncMock(return_value=req)),
            patch.object(execution.notification_service, "create_notification", AsyncMock(return_value=True)),
        ):
            result = await execution.complete_stage(
                session,
                1,
                current.id,
                CompleteStagePayload(result_summary="Delivered"),
                actor,
            )

        self.assertIs(result, req)
        self.assertEqual(current.status, C.STAGE_DONE)
        self.assertEqual(req.workflow_status, W.WF_COMPLETED)
        self.assertEqual(req.status, C.LEGACY_ASSIGNED)
        self.assertIsNone(req.closed_at)

    async def test_completion_requires_text_link_or_file(self):
        current = stage(1, C.STAGE_IN_PROGRESS, assigned=True)
        req = request_with(current)
        actor = SimpleNamespace(id=current.assignee_internal_user_id)

        with (
            patch.object(execution.perms, "load_request_with_access", AsyncMock(return_value=(req, SimpleNamespace(role_tag="member")))),
            patch.object(execution, "lock_request_for_update", AsyncMock(return_value=req)),
            patch.object(execution.perms, "can_act_on_stage", return_value=True),
            patch.object(execution.request_stage_repository, "get_stage", AsyncMock(return_value=current)),
        ):
            with self.assertRaises(HTTPException) as caught:
                await execution.complete_stage(
                    MagicMock(), 1, current.id, CompleteStagePayload(), actor
                )

        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(current.status, C.STAGE_IN_PROGRESS)


class RequestArchiveTests(unittest.IsolatedAsyncioTestCase):
    async def test_closed_request_is_archived_with_canonical_status(self):
        req = SimpleNamespace(
            id=1,
            workflow_status=W.WF_CLOSED,
            deleted=False,
            updated_at=None,
        )
        actor = SimpleNamespace(id=uuid.uuid4())
        session = MagicMock()
        session.commit = AsyncMock()

        with (
            patch.object(request_service.perms, "load_request_with_access", AsyncMock(return_value=(req, SimpleNamespace(role_tag="owner")))),
            patch.object(request_service.perms, "can_manage_request", return_value=True),
            patch.object(request_service.request_history_repository, "append_history", AsyncMock()),
            patch.object(request_service.request_repository, "update", AsyncMock(return_value=req)),
        ):
            await request_service.delete_request(session, 1, actor)

        self.assertTrue(req.deleted)
        self.assertEqual(req.workflow_status, W.WF_ARCHIVED)
        session.commit.assert_awaited_once()

    async def test_active_request_cannot_be_archived(self):
        req = SimpleNamespace(id=1, workflow_status=W.WF_IN_PROGRESS)
        actor = SimpleNamespace(id=uuid.uuid4())

        with (
            patch.object(request_service.perms, "load_request_with_access", AsyncMock(return_value=(req, SimpleNamespace(role_tag="owner")))),
            patch.object(request_service.perms, "can_manage_request", return_value=True),
        ):
            with self.assertRaises(HTTPException) as caught:
                await request_service.delete_request(MagicMock(), 1, actor)

        self.assertEqual(caught.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
