from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_execution as C
from app.constants import request_workflow as W
from app.core.config import settings
from app.models.request import Request
from app.models.request_stage import RequestStage
from app.models.user import User
from app.repositories import (
    organization_repository,
    request_repository,
    request_stage_repository,
)
from app.schemas.performer_selection import AssignRequestPayload
from app.services import notification_service
from app.services import request_execution_service
from app.services import request_permissions as perms

logger = logging.getLogger(__name__)


async def assign_responsible(
    session: AsyncSession,
    request_id: int,
    responsible_user_id: uuid.UUID,
    current_user: User,
) -> Request:
    request, member = await perms.load_request_with_access(session, request_id, current_user)
    if not perms.can_assign_responsible(member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the organization owner can assign a responsible user")
    if request.workflow_status in (W.WF_CLOSED, W.WF_CANCELLED, W.WF_ARCHIVED):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Terminal request cannot be reassigned")
    if request.organization_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request has no organization")
    target_member = await organization_repository.get_member(
        session, request.organization_id, responsible_user_id
    )
    if target_member is None or target_member.user is None or not target_member.user.is_active:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Responsible user must be an active organization member")

    old_id = request.responsible_user_id
    request.responsible_user_id = responsible_user_id
    if request.workflow_status == W.WF_NEW:
        request.workflow_status = W.WF_PLANNING
        request.status = C.LEGACY_OPEN
    request.updated_at = datetime.now(timezone.utc)
    await request_execution_service.append_event(
        session,
        request_id=request.id,
        stage_id=None,
        event_type=C.EVENT_RESPONSIBLE_CHANGED,
        actor_user_id=current_user.id,
        payload={
            "old_responsible_user_id": str(old_id) if old_id else None,
            "new_responsible_user_id": str(responsible_user_id),
        },
    )
    await notification_service.create_notification(
        session,
        recipient_user_id=responsible_user_id,
        notification_type="request_responsible_assigned",
        title=f"Вы назначены ответственным за заявку № {request.id}",
        body=request.title,
        request=request,
    )
    if old_id is None and request.created_by_user_id != responsible_user_id:
        await notification_service.notify_request_author(
            session,
            request,
            actor_user_id=current_user.id,
            notification_type="request_in_work",
            title=f"Вашу заявку № {request.id} взяли в работу",
            body=request.title,
        )
    await request_repository.update(session, request)
    await session.commit()
    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None
    return refreshed


async def start_request(
    session: AsyncSession, request_id: int, current_user: User
) -> Request:
    request, member = await perms.load_request_with_access(session, request_id, current_user)
    request = await request_execution_service.lock_request_for_update(session, request)
    if not perms.can_manage_request(request, current_user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the responsible user or owner can start the request")
    if request.workflow_status != W.WF_PLANNING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request must be in planning status")
    if request.responsible_user_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Assign a responsible user first")
    stages = [stage for stage in request_execution_service._ordered_stages(request) if stage.status != C.STAGE_CANCELLED]
    first = request_execution_service.find_active_stage(stages)
    if first is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Add at least one stage")
    has_assignee = bool(
        (first.assignee_kind == "internal" and first.assignee_internal_user_id)
        or (first.assignee_kind == "external" and first.assignee_external_contractor_id)
    )
    if not has_assignee:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Assign the first stage performer")

    now = datetime.now(timezone.utc)
    first.status = C.STAGE_IN_PROGRESS
    first.started_at = first.started_at or now
    request.workflow_status = W.WF_IN_PROGRESS
    request.status = C.LEGACY_ASSIGNED
    request.closed_at = None
    request.updated_at = now
    request_execution_service.apply_derived_execution_fields(request, stages)
    await request_execution_service.append_event(
        session,
        request_id=request.id,
        stage_id=first.id,
        event_type=C.EVENT_START,
        actor_user_id=current_user.id,
        payload={"stage_id": str(first.id)},
    )
    await notification_service.notify_stage_assignee(
        session,
        request,
        first,
        notification_type="stage_started",
        title=f"Начат этап «{first.title}»",
        body=f"Заявка № {request.id}",
    )
    await request_repository.update(session, request)
    await session.commit()
    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None
    return refreshed


async def close_request(
    session: AsyncSession, request_id: int, current_user: User
) -> Request:
    request, member = await perms.load_request_with_access(session, request_id, current_user)
    request = await request_execution_service.lock_request_for_update(session, request)
    if not perms.can_manage_request(request, current_user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the responsible user or owner can close the request")
    if request.workflow_status != W.WF_COMPLETED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="All stages must be completed first")
    now = datetime.now(timezone.utc)
    request.workflow_status = W.WF_CLOSED
    request.status = C.LEGACY_CLOSED
    request.closed_at = now
    request.updated_at = now
    await request_execution_service.append_event(
        session,
        request_id=request.id,
        stage_id=None,
        event_type=C.EVENT_REQUEST_CLOSED,
        actor_user_id=current_user.id,
        payload={},
    )
    await notification_service.notify_request_author(
        session,
        request,
        actor_user_id=current_user.id,
        notification_type="request_closed",
        title=f"Ваша заявка № {request.id} закрыта",
        body=request.title,
    )
    await request_repository.update(session, request)
    await session.commit()
    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None
    return refreshed


async def cancel_request(
    session: AsyncSession, request_id: int, current_user: User, *, reason: str
) -> Request:
    request, member = await perms.load_request_with_access(session, request_id, current_user)
    request = await request_execution_service.lock_request_for_update(session, request)
    if not perms.can_manage_request(request, current_user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the responsible user or owner can cancel the request")
    if request.workflow_status in (W.WF_CLOSED, W.WF_CANCELLED, W.WF_ARCHIVED):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request is already terminal")
    if not reason.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cancellation reason is required")
    now = datetime.now(timezone.utc)
    for stage in request.stages:
        if stage.status not in C.STAGE_TERMINAL:
            stage.status = C.STAGE_CANCELLED
    request.workflow_status = W.WF_CANCELLED
    request.status = C.LEGACY_CLOSED
    request.closed_at = now
    request.updated_at = now
    request_execution_service.apply_derived_execution_fields(request, request.stages)
    await request_execution_service.append_event(
        session,
        request_id=request.id,
        stage_id=None,
        event_type=W.HISTORY_REQUEST_CANCELLED,
        actor_user_id=current_user.id,
        payload={"reason": reason.strip()},
    )
    await notification_service.notify_request_author(
        session,
        request,
        actor_user_id=current_user.id,
        notification_type="request_cancelled",
        title=f"Ваша заявка № {request.id} отменена",
        body=reason.strip(),
    )
    await request_repository.update(session, request)
    await session.commit()
    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None
    return refreshed


async def request_more_information(
    session: AsyncSession, request_id: int, current_user: User, *, comment: str
) -> Request:
    request, member = await perms.load_request_with_access(session, request_id, current_user)
    if not perms.can_manage_request(request, current_user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the responsible user or owner can request information")
    if request.workflow_status in (W.WF_CLOSED, W.WF_CANCELLED, W.WF_ARCHIVED):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request is already terminal")
    if not comment.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Information request comment is required")
    old_status = request.workflow_status
    request.workflow_status = W.WF_WAITING_INFO
    request.updated_at = datetime.now(timezone.utc)
    await request_execution_service.append_event(
        session, request_id=request.id, stage_id=None, event_type="request_info_requested",
        actor_user_id=current_user.id, payload={"comment": comment.strip(), "old_status": old_status},
    )
    await notification_service.notify_request_author(
        session,
        request,
        actor_user_id=current_user.id,
        notification_type="request_info_requested",
        title=f"По заявке № {request.id} нужна информация",
        body=comment.strip(),
    )
    await request_repository.update(session, request)
    await session.commit()
    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None
    return refreshed


# ─── Taking a request into work ───────────────────────────────────────────────


def _ensure_not_terminal(request: Request) -> None:
    if request.workflow_status in (W.WF_CLOSED, W.WF_CANCELLED, W.WF_ARCHIVED):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request is already terminal")


def _apply_take(request: Request, current_user: User) -> None:
    request.responsible_user_id = current_user.id
    request.workflow_status = W.WF_PLANNING
    request.status = C.LEGACY_OPEN
    request.updated_at = datetime.now(timezone.utc)


async def _append_take_side_effects(
    session: AsyncSession, request: Request, current_user: User
) -> None:
    await request_execution_service.append_event(
        session,
        request_id=request.id,
        stage_id=None,
        event_type=C.EVENT_REQUEST_TAKEN,
        actor_user_id=current_user.id,
        payload={"responsible_user_id": str(current_user.id)},
    )
    await notification_service.notify_org_owners(
        session,
        request,
        exclude_user_ids={current_user.id, request.created_by_user_id},
        notification_type="request_taken",
        title=f"Заявку № {request.id} взяли в работу",
        body=request.title,
    )
    await notification_service.notify_request_author(
        session,
        request,
        actor_user_id=current_user.id,
        notification_type="request_in_work",
        title=f"Вашу заявку № {request.id} взяли в работу",
        body=request.title,
    )


async def take_request(
    session: AsyncSession, request_id: int, current_user: User
) -> Request:
    """Any organization member takes a free request and becomes responsible."""
    request, member = await perms.load_request_with_access(session, request_id, current_user)
    request = await request_execution_service.lock_request_for_update(session, request)
    if not perms.can_take_request(request, member):
        if request.responsible_user_id is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Заявку уже взяли в работу")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Заявку нельзя взять в работу в текущем статусе")

    _apply_take(request, current_user)
    await _append_take_side_effects(session, request, current_user)
    await request_repository.update(session, request)
    await session.commit()
    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None
    return refreshed


async def release_request(
    session: AsyncSession, request_id: int, current_user: User, *, reason: str
) -> Request:
    """Responsible user gives the request back before it was started."""
    request, _member = await perms.load_request_with_access(session, request_id, current_user)
    request = await request_execution_service.lock_request_for_update(session, request)
    if not perms.is_responsible(request, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the responsible user can release the request")
    if request.workflow_status != W.WF_PLANNING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Отказаться можно только до запуска заявки")
    if not reason.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Release reason is required")

    request.responsible_user_id = None
    request.workflow_status = W.WF_NEW
    request.updated_at = datetime.now(timezone.utc)
    await request_execution_service.append_event(
        session,
        request_id=request.id,
        stage_id=None,
        event_type=C.EVENT_RESPONSIBLE_RELEASED,
        actor_user_id=current_user.id,
        payload={"reason": reason.strip()},
    )
    await notification_service.notify_org_owners(
        session,
        request,
        exclude_user_ids={current_user.id},
        notification_type="request_released",
        title=f"От заявки № {request.id} отказались",
        body=reason.strip(),
    )
    await request_repository.update(session, request)
    await session.commit()
    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None
    return refreshed


async def self_execute_request(
    session: AsyncSession, request_id: int, current_user: User
) -> Request:
    """«Сделаю сам»: the responsible user does the work alone — one stage, assigned to self, started."""
    request, member = await perms.load_request_with_access(session, request_id, current_user)
    request = await request_execution_service.lock_request_for_update(session, request)

    if perms.can_take_request(request, member):
        _apply_take(request, current_user)
        await _append_take_side_effects(session, request, current_user)
    if not perms.is_responsible(request, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the responsible user can execute the request personally")
    if request.workflow_status != W.WF_PLANNING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request must be in planning status")

    stages = [s for s in request_execution_service._ordered_stages(request) if s.status != C.STAGE_CANCELLED]
    stage = request_execution_service.find_active_stage(stages)
    created_stage = stage is None
    if stage is None:
        stage = RequestStage(
            request_id=request.id,
            sequence=await request_stage_repository.max_sequence(session, request.id) + 1,
            title=request.title[:500],
            assignee_kind="unassigned",
            status=C.STAGE_PENDING,
            source=C.STAGE_SOURCE_MANUAL,
        )
        session.add(stage)
        await session.flush()
        request.stages.append(stage)
        await request_execution_service.append_event(
            session,
            request_id=request.id,
            stage_id=stage.id,
            event_type=C.EVENT_STAGE_ADDED,
            actor_user_id=current_user.id,
            payload={"title": stage.title, "sequence": stage.sequence},
        )

    await request_execution_service.assign_payload_to_stage(
        session,
        request,
        stage,
        AssignRequestPayload(performer_id=f"internal:{current_user.id}", contact_method="auto"),
        current_user,
    )
    await request_repository.update(session, request)
    await session.commit()

    if created_stage and settings.AI_JOBS_ENABLED:
        try:
            from app.services import stage_specification_service

            await stage_specification_service.enqueue_generation(session, request.id, stage.id, force=False)
        except Exception:
            logger.exception("Could not enqueue stage specification for stage %s", stage.id)

    return await start_request(session, request_id, current_user)


async def update_attributes(
    session: AsyncSession,
    request_id: int,
    current_user: User,
    *,
    fields: set[str],
    priority: str | None,
    due_date: datetime | None,
) -> Request:
    """Edit passport attributes (priority, due date) — responsible user or owner."""
    request, member = await perms.load_request_with_access(session, request_id, current_user)
    if not perms.can_manage_request(request, current_user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the responsible user or owner can edit request attributes")
    _ensure_not_terminal(request)

    if "priority" in fields and priority is not None and priority != request.priority:
        if priority not in W.PRIORITIES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid priority")
        await request_execution_service.append_event(
            session,
            request_id=request.id,
            stage_id=None,
            event_type=C.EVENT_PRIORITY_CHANGED,
            actor_user_id=current_user.id,
            payload={"old": request.priority, "new": priority},
        )
        request.priority = priority

    if "due_date" in fields and due_date != request.due_date:
        await request_execution_service.append_event(
            session,
            request_id=request.id,
            stage_id=None,
            event_type=C.EVENT_DUE_DATE_CHANGED,
            actor_user_id=current_user.id,
            payload={
                "old": request.due_date.isoformat() if request.due_date else None,
                "new": due_date.isoformat() if due_date else None,
            },
        )
        request.due_date = due_date

    request.updated_at = datetime.now(timezone.utc)
    await request_repository.update(session, request)
    await session.commit()
    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None
    return refreshed
