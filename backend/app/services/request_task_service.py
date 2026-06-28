"""Request subtasks CRUD and assignee management."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_workflow as W
from app.models.request_task import RequestTask
from app.models.user import User
from app.repositories import request_history_repository, request_task_repository
from app.schemas.request_workflow import (
    CreateRequestTaskPayload,
    PatchRequestTaskAssigneePayload,
    PatchRequestTaskStatusPayload,
    RequestTaskAssigneePreview,
    RequestTaskResponse,
    UpdateRequestTaskPayload,
)
from app.schemas.user import PublicAuthorResponse
from app.services import request_permissions as perms
from app.services.request_workflow_service import _parse_iso_datetime


def _author_preview(user) -> PublicAuthorResponse | None:
    if user is None:
        return None
    return PublicAuthorResponse(
        id=str(user.id),
        first_name=user.first_name,
        last_name=user.last_name,
        middle_name=user.middle_name,
        email=user.email,
    )


def _assignee_preview(user) -> RequestTaskAssigneePreview | None:
    if user is None:
        return None
    return RequestTaskAssigneePreview(
        id=str(user.id),
        first_name=user.first_name,
        last_name=user.last_name,
        middle_name=user.middle_name,
        email=user.email,
    )


def task_to_response(task: RequestTask) -> RequestTaskResponse:
    return RequestTaskResponse(
        id=str(task.id),
        request_id=str(task.request_id),
        title=task.title,
        description=task.description,
        status=task.status,
        assignee_id=str(task.assignee_id) if task.assignee_id else None,
        assignee=_assignee_preview(task.assignee),
        created_by_id=str(task.created_by_id) if task.created_by_id else None,
        created_by=_author_preview(task.created_by),
        priority=task.priority,
        due_date=task.due_date.isoformat() if task.due_date else None,
        is_required=task.is_required,
        order_index=task.order_index,
        created_at=task.created_at.isoformat(),
        updated_at=task.updated_at.isoformat(),
        completed_at=task.completed_at.isoformat() if task.completed_at else None,
    )


async def list_tasks(
    session: AsyncSession, request_id: int, user: User
) -> list[RequestTaskResponse]:
    req, member = await perms.load_request_with_access(session, request_id, user)
    if not perms.can_view_request(req, user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    tasks = await request_task_repository.list_tasks_for_request(session, request_id)
    return [task_to_response(t) for t in tasks]


async def create_task(
    session: AsyncSession,
    request_id: int,
    payload: CreateRequestTaskPayload,
    user: User,
) -> RequestTaskResponse:
    req, member = await perms.load_request_with_access(session, request_id, user)
    if not perms.can_manage_tasks(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization managers can create subtasks",
        )

    assignee_uuid: uuid.UUID | None = None
    if payload.assignee_id:
        assignee_uuid = uuid.UUID(payload.assignee_id)
        await perms.ensure_assignee_in_org(session, req.organization_id, assignee_uuid)

    order_index = payload.order_index
    if order_index is None:
        order_index = await request_task_repository.next_order_index(session, request_id)

    now = datetime.now(timezone.utc)
    task = RequestTask(
        request_id=request_id,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        status=payload.status,
        assignee_id=assignee_uuid,
        created_by_id=user.id,
        priority=payload.priority,
        due_date=_parse_iso_datetime(payload.due_date),
        is_required=payload.is_required,
        order_index=order_index,
        completed_at=now if payload.status == W.TASK_DONE else None,
    )
    task = await request_task_repository.create_task(session, task)

    await request_history_repository.append_history(
        session,
        request_id=request_id,
        actor_id=user.id,
        event_type=W.HISTORY_TASK_CREATED,
        payload={
            "task_id": str(task.id),
            "task_title": task.title,
            "status": task.status,
            "assignee_id": str(assignee_uuid) if assignee_uuid else None,
        },
    )

    await session.commit()
    saved = await request_task_repository.get_task_by_id(session, request_id, task.id)
    assert saved is not None
    return task_to_response(saved)


async def update_task(
    session: AsyncSession,
    request_id: int,
    task_id: uuid.UUID,
    payload: UpdateRequestTaskPayload,
    user: User,
) -> RequestTaskResponse:
    req, member = await perms.load_request_with_access(session, request_id, user)
    task = await request_task_repository.get_task_by_id(session, request_id, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if not perms.can_manage_tasks(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization managers can edit subtasks",
        )

    changes: dict = {}

    if payload.title is not None:
        task.title = payload.title.strip()
        changes["title"] = task.title
    if payload.description is not None:
        task.description = payload.description.strip() or None
        changes["description"] = task.description
    if payload.priority is not None:
        task.priority = payload.priority
        changes["priority"] = task.priority
    if payload.due_date is not None:
        task.due_date = _parse_iso_datetime(payload.due_date)
        changes["due_date"] = payload.due_date
    if payload.is_required is not None:
        task.is_required = payload.is_required
        changes["is_required"] = payload.is_required
    if payload.order_index is not None:
        task.order_index = payload.order_index
        changes["order_index"] = payload.order_index

    if payload.status is not None:
        await _apply_status_change(session, request_id, task, payload.status, user, changes)

    if payload.assignee_id is not None:
        new_assignee = uuid.UUID(payload.assignee_id) if payload.assignee_id else None
        await _apply_assignee_change(session, req.organization_id, request_id, task, new_assignee, user)

    task.updated_at = datetime.now(timezone.utc)
    task = await request_task_repository.update_task(session, task)

    if changes:
        await request_history_repository.append_history(
            session,
            request_id=request_id,
            actor_id=user.id,
            event_type=W.HISTORY_TASK_UPDATED,
            payload={"task_id": str(task.id), "task_title": task.title, **changes},
        )

    await session.commit()
    saved = await request_task_repository.get_task_by_id(session, request_id, task_id)
    assert saved is not None
    return task_to_response(saved)


async def patch_task_status(
    session: AsyncSession,
    request_id: int,
    task_id: uuid.UUID,
    payload: PatchRequestTaskStatusPayload,
    user: User,
) -> RequestTaskResponse:
    req, member = await perms.load_request_with_access(session, request_id, user)
    task = await request_task_repository.get_task_by_id(session, request_id, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if not perms.can_update_task(task, user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if payload.status == W.TASK_CANCELLED and not perms.can_manage_tasks(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers can cancel subtasks",
        )

    changes: dict = {}
    await _apply_status_change(session, request_id, task, payload.status, user, changes)
    task.updated_at = datetime.now(timezone.utc)
    task = await request_task_repository.update_task(session, task)
    await session.commit()
    saved = await request_task_repository.get_task_by_id(session, request_id, task_id)
    assert saved is not None
    return task_to_response(saved)


async def patch_task_assignee(
    session: AsyncSession,
    request_id: int,
    task_id: uuid.UUID,
    payload: PatchRequestTaskAssigneePayload,
    user: User,
) -> RequestTaskResponse:
    req, member = await perms.load_request_with_access(session, request_id, user)
    if not perms.can_assign_task(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization managers can assign subtasks",
        )

    task = await request_task_repository.get_task_by_id(session, request_id, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    new_assignee = uuid.UUID(payload.assignee_id) if payload.assignee_id else None
    await _apply_assignee_change(session, req.organization_id, request_id, task, new_assignee, user)
    task.updated_at = datetime.now(timezone.utc)
    task = await request_task_repository.update_task(session, task)
    await session.commit()
    saved = await request_task_repository.get_task_by_id(session, request_id, task_id)
    assert saved is not None
    return task_to_response(saved)


async def delete_task(
    session: AsyncSession, request_id: int, task_id: uuid.UUID, user: User
) -> RequestTaskResponse:
    _req, member = await perms.load_request_with_access(session, request_id, user)
    if not perms.can_manage_tasks(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization managers can cancel subtasks",
        )

    task = await request_task_repository.get_task_by_id(session, request_id, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.status != W.TASK_CANCELLED:
        await _apply_status_change(
            session,
            request_id,
            task,
            W.TASK_CANCELLED,
            user,
            {},
        )
        task.updated_at = datetime.now(timezone.utc)
        task = await request_task_repository.update_task(session, task)

    await session.commit()
    saved = await request_task_repository.get_task_by_id(session, request_id, task_id)
    assert saved is not None
    return task_to_response(saved)


async def _apply_status_change(
    session: AsyncSession,
    request_id: int,
    task: RequestTask,
    new_status: str,
    user: User,
    changes: dict,
) -> None:
    old_status = task.status
    if old_status == new_status:
        return
    task.status = new_status
    changes["old_status"] = old_status
    changes["new_status"] = new_status
    if new_status == W.TASK_DONE:
        task.completed_at = datetime.now(timezone.utc)
        await request_history_repository.append_history(
            session,
            request_id=request_id,
            actor_id=user.id,
            event_type=W.HISTORY_TASK_COMPLETED,
            payload={
                "task_id": str(task.id),
                "task_title": task.title,
            },
        )
    else:
        if new_status != W.TASK_DONE:
            task.completed_at = None
        await request_history_repository.append_history(
            session,
            request_id=request_id,
            actor_id=user.id,
            event_type=W.HISTORY_TASK_STATUS_CHANGED,
            payload={
                "task_id": str(task.id),
                "task_title": task.title,
                "old_status": old_status,
                "new_status": new_status,
            },
        )


async def _apply_assignee_change(
    session: AsyncSession,
    org_id,
    request_id: int,
    task: RequestTask,
    new_assignee: uuid.UUID | None,
    user: User,
) -> None:
    if org_id is not None:
        await perms.ensure_assignee_in_org(session, org_id, new_assignee)
    old_assignee = str(task.assignee_id) if task.assignee_id else None
    new_assignee_str = str(new_assignee) if new_assignee else None
    if old_assignee == new_assignee_str:
        return
    task.assignee_id = new_assignee
    await request_history_repository.append_history(
        session,
        request_id=request_id,
        actor_id=user.id,
        event_type=W.HISTORY_TASK_ASSIGNEE_CHANGED,
        payload={
            "task_id": str(task.id),
            "task_title": task.title,
            "old_assignee_id": old_assignee,
            "new_assignee_id": new_assignee_str,
        },
    )
