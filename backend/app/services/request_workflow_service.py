"""Request workflow status transitions and history."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_workflow as W
from app.models.request import Request
from app.models.user import User
from app.repositories import request_history_repository, request_repository, request_task_repository
from app.schemas.request_workflow import (
    PatchWorkflowStatusPayload,
    RequestHistoryActorResponse,
    RequestHistoryEventResponse,
    WorkflowStatusSuggestion,
)
from app.services import request_permissions as perms


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid due_date format",
        ) from exc


def validate_workflow_transition(current: str, new: str) -> None:
    allowed = W.WORKFLOW_TRANSITIONS.get(current, frozenset())
    if new not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transition from '{current}' to '{new}' is not allowed",
        )


async def _has_incomplete_required_tasks(session: AsyncSession, request_id: int) -> bool:
    tasks = await request_task_repository.list_tasks_for_request(session, request_id)
    for task in tasks:
        if task.is_required and task.status not in W.TASK_TERMINAL:
            return True
    return False


def history_to_response(event) -> RequestHistoryEventResponse:
    actor = None
    if event.actor is not None:
        actor = RequestHistoryActorResponse(
            id=str(event.actor.id),
            first_name=event.actor.first_name,
            last_name=event.actor.last_name,
            middle_name=event.actor.middle_name,
            email=event.actor.email,
        )
    return RequestHistoryEventResponse(
        id=str(event.id),
        request_id=str(event.request_id),
        actor_id=str(event.actor_id) if event.actor_id else None,
        actor=actor,
        type=event.type,
        payload=event.payload,
        created_at=event.created_at.isoformat(),
    )


async def list_history(
    session: AsyncSession, request_id: int, user: User
) -> list[RequestHistoryEventResponse]:
    await perms.load_request_with_access(session, request_id, user)
    rows = await request_history_repository.list_history_for_request(session, request_id)
    return [history_to_response(row) for row in rows]


async def change_workflow_status(
    session: AsyncSession,
    request_id: int,
    payload: PatchWorkflowStatusPayload,
    user: User,
) -> Request:
    req, member = await perms.load_request_with_access(session, request_id, user)

    if not perms.can_manage_workflow(member) and not (
        perms.can_edit_request_draft(req, user) and payload.status == W.WF_NEW
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to change request status",
        )

    old_status = req.workflow_status
    new_status = payload.status

    if old_status == new_status:
        return req

    validate_workflow_transition(old_status, new_status)

    if new_status == W.WF_ARCHIVED and old_status not in W.ARCHIVABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only completed or cancelled requests can be archived",
        )

    if new_status == W.WF_COMPLETED:
        has_incomplete = await _has_incomplete_required_tasks(session, request_id)
        if has_incomplete and not payload.force_complete:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Required subtasks are not completed. Confirm to force completion.",
            )

    req.workflow_status = new_status
    req.updated_at = datetime.now(timezone.utc)

    if new_status == W.WF_COMPLETED:
        req.status = "closed"
        req.closed_at = datetime.now(timezone.utc)
    elif new_status == W.WF_CANCELLED:
        req.status = "closed"
        req.closed_at = datetime.now(timezone.utc)
    elif new_status == W.WF_ARCHIVED:
        req.deleted = True
    elif new_status in (W.WF_IN_PROGRESS, W.WF_TRIAGE, W.WF_REVIEW):
        if req.status == "open":
            req.status = "assigned"
    elif new_status == W.WF_NEW:
        req.status = "open"
        req.closed_at = None
        req.deleted = False

    history_type = W.HISTORY_REQUEST_STATUS_CHANGED
    if new_status == W.WF_COMPLETED:
        history_type = W.HISTORY_REQUEST_COMPLETED
    elif new_status == W.WF_CANCELLED:
        history_type = W.HISTORY_REQUEST_CANCELLED

    await request_history_repository.append_history(
        session,
        request_id=request_id,
        actor_id=user.id,
        event_type=history_type,
        payload={
            "old_status": old_status,
            "new_status": new_status,
            "comment": payload.comment,
            "force_complete": payload.force_complete,
        },
    )

    req = await request_repository.update(session, req)
    await session.commit()
    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None
    return refreshed


async def suggest_workflow_status(
    session: AsyncSession, request_id: int, user: User
) -> WorkflowStatusSuggestion | None:
    req, _member = await perms.load_request_with_access(session, request_id, user)
    tasks = await request_task_repository.list_tasks_for_request(session, request_id)
    active_with_assignee = [
        t
        for t in tasks
        if t.status in W.TASK_ACTIVE and t.assignee_id is not None
    ]
    if req.workflow_status in (W.WF_NEW, W.WF_TRIAGE) and active_with_assignee:
        return WorkflowStatusSuggestion(
            suggested_status=W.WF_IN_PROGRESS,
            reason="Есть активные подзадачи с назначенным исполнителем",
        )

    required_tasks = [t for t in tasks if t.is_required]
    if required_tasks and all(t.status in W.TASK_TERMINAL for t in required_tasks):
        if req.workflow_status == W.WF_IN_PROGRESS:
            return WorkflowStatusSuggestion(
                suggested_status=W.WF_REVIEW,
                reason="Все обязательные подзадачи завершены",
            )
    return None


async def log_request_created(
    session: AsyncSession, request_id: int, actor_id: uuid.UUID
) -> None:
    await request_history_repository.append_history(
        session,
        request_id=request_id,
        actor_id=actor_id,
        event_type=W.HISTORY_REQUEST_CREATED,
        payload={},
    )
