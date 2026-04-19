"""Multi-stage request execution: stages, derived status, transfer events."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_execution as C
from app.models.request import Request
from app.models.request_execution_event import RequestExecutionEvent
from app.models.request_stage import RequestStage
from app.models.user import User
from app.repositories import (
    external_contractor_repository,
    organization_repository,
    request_repository,
    request_stage_repository,
)
from app.schemas.performer_selection import AssignRequestPayload
from app.schemas.request_execution import (
    AddRequestStagePayload,
    BlockStagePayload,
    CompleteStagePayload,
    PatchRequestStagePayload,
    RequestExecutionEventResponse,
    RequestStageResponse,
    StageAssigneePreviewResponse,
    UnblockStagePayload,
)
from app.services.performer_selection_service import (
    _ensure_org_member,
    _resolve_external_contact,
    _resolve_internal_contact,
    log_analytics,
    parse_performer_ref,
    send_technical_spec_stub,
)
from app.services.performer_selection_service import ALLOWED_CONTACT_METHODS

logger = logging.getLogger(__name__)


def _ordered_stages(request: Request) -> list[RequestStage]:
    return sorted(request.stages, key=lambda s: s.sequence)


def find_active_stage(stages: list[RequestStage]) -> RequestStage | None:
    for s in sorted(stages, key=lambda x: x.sequence):
        if s.status not in C.STAGE_TERMINAL:
            return s
    return None


def _last_done_stage(stages: list[RequestStage]) -> RequestStage | None:
    done = [s for s in stages if s.status == C.STAGE_DONE]
    if not done:
        return None
    return max(done, key=lambda s: s.sequence)


def derive_execution_status(stages: list[RequestStage]) -> str:
    relevant = [s for s in stages if s.status != C.STAGE_CANCELLED]
    if not relevant:
        return C.EXEC_NEW
    if all(s.status == C.STAGE_DONE for s in relevant):
        return C.EXEC_COMPLETED
    active = find_active_stage(relevant)
    if active is None:
        return C.EXEC_COMPLETED
    st = active.status
    if st == C.STAGE_BLOCKED:
        return C.EXEC_BLOCKED
    if st in (C.STAGE_WAITING_ASSIGNMENT, C.STAGE_WAITING_EXTERNAL):
        return C.EXEC_WAITING
    if st in (C.STAGE_IN_PROGRESS, C.STAGE_NEEDS_REVIEW):
        return C.EXEC_IN_PROGRESS
    if st == C.STAGE_PENDING:
        return C.EXEC_NEW
    return C.EXEC_IN_PROGRESS


def _execution_to_legacy_status(execution_status: str) -> str:
    if execution_status == C.EXEC_COMPLETED:
        return C.LEGACY_CLOSED
    if execution_status == C.EXEC_NEW:
        return C.LEGACY_OPEN
    return C.LEGACY_ASSIGNED


def _copy_assignee_to_request_from_stage(req: Request, stage: RequestStage) -> None:
    if stage.assignee_kind == "internal" and stage.assignee_internal_user_id:
        req.assigned_kind = "internal"
        req.assigned_internal_user_id = stage.assignee_internal_user_id
        req.assigned_external_contractor_id = None
    elif stage.assignee_kind == "external" and stage.assignee_external_contractor_id:
        req.assigned_kind = "external"
        req.assigned_external_contractor_id = stage.assignee_external_contractor_id
        req.assigned_internal_user_id = None
    else:
        req.assigned_kind = None
        req.assigned_internal_user_id = None
        req.assigned_external_contractor_id = None


def sync_legacy_assignment(req: Request, stages: list[RequestStage]) -> None:
    active = find_active_stage(stages)
    if active is not None:
        _copy_assignee_to_request_from_stage(req, active)
        return
    if derive_execution_status(stages) == C.EXEC_COMPLETED:
        last = _last_done_stage(stages)
        if last is not None:
            _copy_assignee_to_request_from_stage(req, last)
            return
    req.assigned_kind = None
    req.assigned_internal_user_id = None
    req.assigned_external_contractor_id = None


def apply_derived_execution_fields(req: Request, stages: list[RequestStage]) -> None:
    """Update execution_status and legacy assignment + status columns."""
    exec_st = derive_execution_status(stages)
    req.execution_status = exec_st
    sync_legacy_assignment(req, stages)
    legacy_st = _execution_to_legacy_status(exec_st)
    req.status = legacy_st
    if exec_st == C.EXEC_COMPLETED:
        if req.closed_at is None:
            req.closed_at = datetime.now(timezone.utc)
    elif legacy_st != C.LEGACY_CLOSED:
        req.closed_at = None


async def append_event(
    session: AsyncSession,
    *,
    request_id: int,
    stage_id: uuid.UUID | None,
    event_type: str,
    actor_user_id: uuid.UUID | None,
    payload: dict | None,
) -> None:
    session.add(
        RequestExecutionEvent(
            request_id=request_id,
            stage_id=stage_id,
            event_type=event_type,
            actor_user_id=actor_user_id,
            payload=payload,
        )
    )


def stage_to_response(stage: RequestStage) -> RequestStageResponse:
    performer_id: str | None = None
    if stage.assignee_kind == "internal" and stage.assignee_internal_user_id:
        performer_id = f"internal:{stage.assignee_internal_user_id}"
    elif stage.assignee_kind == "external" and stage.assignee_external_contractor_id:
        performer_id = f"external:{stage.assignee_external_contractor_id}"

    assignee_preview: StageAssigneePreviewResponse | None = None
    if stage.assignee_internal_user is not None:
        u = stage.assignee_internal_user
        assignee_preview = StageAssigneePreviewResponse(
            kind="internal",
            full_name=_user_display(u),
            email=u.email,
        )
    elif stage.assignee_external_contractor is not None:
        ec = stage.assignee_external_contractor
        assignee_preview = StageAssigneePreviewResponse(
            kind="external",
            full_name=ec.full_name,
            email=None,
        )

    return RequestStageResponse(
        id=str(stage.id),
        request_id=str(stage.request_id),
        sequence=stage.sequence,
        title=stage.title,
        description=stage.description,
        assignee_kind=stage.assignee_kind,
        performer_id=performer_id,
        assignee_preview=assignee_preview,
        status=stage.status,
        blocked_reason=stage.blocked_reason,
        started_at=stage.started_at.isoformat() if stage.started_at else None,
        completed_at=stage.completed_at.isoformat() if stage.completed_at else None,
        completed_by_user_id=str(stage.completed_by_user_id)
        if stage.completed_by_user_id
        else None,
        result_summary=stage.result_summary,
        source=stage.source,
        template_key=stage.template_key,
        created_at=stage.created_at.isoformat(),
        updated_at=stage.updated_at.isoformat(),
    )


def event_to_response(ev: RequestExecutionEvent) -> RequestExecutionEventResponse:
    return RequestExecutionEventResponse(
        id=str(ev.id),
        request_id=str(ev.request_id),
        stage_id=str(ev.stage_id) if ev.stage_id else None,
        event_type=ev.event_type,
        actor_user_id=str(ev.actor_user_id) if ev.actor_user_id else None,
        payload=ev.payload,
        created_at=ev.created_at.isoformat(),
    )


def _user_display(user: User) -> str:
    parts = [user.last_name, user.first_name, user.middle_name]
    name = " ".join(p for p in parts if p).strip()
    return name or user.full_name or "Пользователь"


async def _reload_request(session: AsyncSession, request_id: int) -> Request | None:
    return await request_repository.get_by_id(session, request_id)


async def ensure_default_first_stage(session: AsyncSession, req: Request) -> RequestStage:
    stages = _ordered_stages(req)
    if stages:
        return stages[0]
    st = RequestStage(
        request_id=req.id,
        sequence=1,
        title=C.DEFAULT_STAGE_TITLE,
        assignee_kind="unassigned",
        status=C.STAGE_PENDING,
        source=C.STAGE_SOURCE_MANUAL,
    )
    session.add(st)
    await session.flush()
    await append_event(
        session,
        request_id=req.id,
        stage_id=st.id,
        event_type=C.EVENT_STAGE_ADDED,
        actor_user_id=None,
        payload={"title": st.title, "sequence": 1},
    )
    req.stages.append(st)
    return st


async def assign_payload_to_stage(
    session: AsyncSession,
    req: Request,
    stage: RequestStage,
    payload: AssignRequestPayload,
    current_user: User,
    *,
    log_assign_event: bool = True,
) -> None:
    """Apply AssignRequestPayload to a single stage (validates org + contacts)."""
    performer_id = payload.performer_id
    send_tz = bool(payload.send_tz)
    contact_method_raw = (payload.contact_method or "auto").strip().lower()
    recommended_performer_id = payload.recommended_performer_id
    if contact_method_raw not in ALLOWED_CONTACT_METHODS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid contact_method",
        )

    org_id = req.organization_id
    assert org_id is not None

    try:
        kind, pid = parse_performer_ref(performer_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid performer_id",
        )

    if kind == "internal":
        member = await organization_repository.get_member(session, org_id, pid)
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Performer is not a member of this organization",
            )
        user = member.user
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="User not found"
            )

        stage.assignee_kind = "internal"
        stage.assignee_internal_user_id = pid
        stage.assignee_external_contractor_id = None

        contact_addr: str | None = None
        ch_used = "email"
        if send_tz:
            contact_addr, ch_used = _resolve_internal_contact(user, contact_method_raw)
            if not contact_addr:
                await log_analytics(
                    session,
                    organization_id=org_id,
                    request_id=req.id,
                    event="missing_contact",
                    payload={"performer_id": performer_id, "contact_method": contact_method_raw},
                )
                await session.commit()
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="No contact information for this performer and channel",
                )
            send_technical_spec_stub(req, ch_used, contact_addr)

    else:
        ec = await external_contractor_repository.get_by_id(session, pid, org_id)
        if ec is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")

        stage.assignee_kind = "external"
        stage.assignee_external_contractor_id = ec.id
        stage.assignee_internal_user_id = None

        if send_tz:
            contact_addr, ch_used = _resolve_external_contact(ec, contact_method_raw)
            if not contact_addr:
                await log_analytics(
                    session,
                    organization_id=org_id,
                    request_id=req.id,
                    event="missing_contact",
                    payload={"performer_id": performer_id, "contact_method": contact_method_raw},
                )
                await session.commit()
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="No contact information for this performer and channel",
                )
            send_technical_spec_stub(req, ch_used, contact_addr)

    now = datetime.now(timezone.utc)
    if stage.started_at is None:
        stage.started_at = now
    if stage.status in (C.STAGE_PENDING, C.STAGE_WAITING_ASSIGNMENT):
        stage.status = C.STAGE_IN_PROGRESS

    apply_derived_execution_fields(req, _ordered_stages(req))

    override = bool(
        recommended_performer_id is not None and recommended_performer_id != performer_id
    )
    await log_analytics(
        session,
        organization_id=org_id,
        request_id=req.id,
        event="assign",
        payload={
            "stage_id": str(stage.id),
            "performer_id": performer_id,
            "send_tz": send_tz,
            "override_recommendation": override,
            "recommended_performer_id": recommended_performer_id,
        },
    )
    if override:
        await log_analytics(
            session,
            organization_id=org_id,
            request_id=req.id,
            event="override",
            payload={"chosen": performer_id, "recommended": recommended_performer_id},
        )

    if log_assign_event:
        await append_event(
            session,
            request_id=req.id,
            stage_id=stage.id,
            event_type=C.EVENT_ASSIGN,
            actor_user_id=current_user.id,
            payload={
                "performer_id": performer_id,
                "recommended_performer_id": recommended_performer_id,
                "override": override,
            },
        )


async def assign_active_stage(
    session: AsyncSession,
    request_id: int,
    payload: AssignRequestPayload,
    current_user: User,
) -> Request:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request has no organization",
        )

    await _ensure_org_member(session, req.organization_id, current_user.id)

    await ensure_default_first_stage(session, req)
    stages = _ordered_stages(req)
    active = find_active_stage(stages)
    if active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active stage to assign",
        )

    await assign_payload_to_stage(session, req, active, payload, current_user)

    req.updated_at = datetime.now(timezone.utc)
    await request_repository.update(session, req)
    await session.commit()

    out = await _reload_request(session, request_id)
    assert out is not None
    return out


async def add_stage(
    session: AsyncSession,
    request_id: int,
    payload: AddRequestStagePayload,
    current_user: User,
) -> Request:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization")

    await _ensure_org_member(session, req.organization_id, current_user.id)

    seq = await request_stage_repository.max_sequence(session, request_id) + 1
    st = RequestStage(
        request_id=request_id,
        sequence=seq,
        title=payload.title,
        description=payload.description,
        assignee_kind="unassigned",
        status=C.STAGE_PENDING,
        source=payload.source or C.STAGE_SOURCE_MANUAL,
    )
    session.add(st)
    await session.flush()
    req.stages.append(st)

    await append_event(
        session,
        request_id=request_id,
        stage_id=st.id,
        event_type=C.EVENT_STAGE_ADDED,
        actor_user_id=current_user.id,
        payload={"title": st.title, "sequence": seq},
    )

    apply_derived_execution_fields(req, _ordered_stages(req))
    req.updated_at = datetime.now(timezone.utc)
    await request_repository.update(session, req)
    await session.commit()

    out = await _reload_request(session, request_id)
    assert out is not None
    return out


async def patch_stage(
    session: AsyncSession,
    request_id: int,
    stage_id: uuid.UUID,
    payload: PatchRequestStagePayload,
    current_user: User,
) -> Request:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization")

    await _ensure_org_member(session, req.organization_id, current_user.id)

    stage = await request_stage_repository.get_stage(session, stage_id)
    if stage is None or stage.request_id != request_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    if stage.status == C.STAGE_DONE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completed stages cannot be edited",
        )

    if payload.title is not None:
        stage.title = payload.title
    if payload.description is not None:
        stage.description = payload.description

    await append_event(
        session,
        request_id=request_id,
        stage_id=stage.id,
        event_type=C.EVENT_STAGE_UPDATED,
        actor_user_id=current_user.id,
        payload={"title": stage.title},
    )

    req.updated_at = datetime.now(timezone.utc)
    await request_repository.update(session, req)
    await session.commit()

    out = await _reload_request(session, request_id)
    assert out is not None
    return out


async def assign_stage(
    session: AsyncSession,
    request_id: int,
    stage_id: uuid.UUID,
    payload: AssignRequestPayload,
    current_user: User,
) -> Request:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization")

    await _ensure_org_member(session, req.organization_id, current_user.id)

    stage = await request_stage_repository.get_stage(session, stage_id)
    if stage is None or stage.request_id != request_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    active = find_active_stage(_ordered_stages(req))
    if active is None or active.id != stage.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only the active stage can receive assignment via this endpoint",
        )

    await assign_payload_to_stage(session, req, stage, payload, current_user)

    req.updated_at = datetime.now(timezone.utc)
    await request_repository.update(session, req)
    await session.commit()

    out = await _reload_request(session, request_id)
    assert out is not None
    return out


async def complete_stage(
    session: AsyncSession,
    request_id: int,
    stage_id: uuid.UUID,
    payload: CompleteStagePayload | None,
    current_user: User,
) -> Request:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization")

    await _ensure_org_member(session, req.organization_id, current_user.id)

    stage = await request_stage_repository.get_stage(session, stage_id)
    if stage is None or stage.request_id != request_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    active = find_active_stage(_ordered_stages(req))
    if active is None or active.id != stage.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only the active stage can be completed",
        )

    now = datetime.now(timezone.utc)
    stage.status = C.STAGE_DONE
    stage.completed_at = now
    stage.completed_by_user_id = current_user.id
    if payload and payload.result_summary:
        stage.result_summary = payload.result_summary

    stages = _ordered_stages(req)
    next_stage: RequestStage | None = None
    for s in stages:
        if s.sequence > stage.sequence and s.status != C.STAGE_CANCELLED:
            next_stage = s
            break

    if next_stage is not None:
        has_assignee = (
            next_stage.assignee_kind == "internal" and next_stage.assignee_internal_user_id is not None
        ) or (
            next_stage.assignee_kind == "external"
            and next_stage.assignee_external_contractor_id is not None
        )
        if has_assignee:
            next_stage.status = C.STAGE_IN_PROGRESS
            if next_stage.started_at is None:
                next_stage.started_at = now
        else:
            next_stage.status = C.STAGE_WAITING_ASSIGNMENT
            next_stage.assignee_kind = "unassigned"

    apply_derived_execution_fields(req, _ordered_stages(req))

    await append_event(
        session,
        request_id=request_id,
        stage_id=stage.id,
        event_type=C.EVENT_COMPLETE,
        actor_user_id=current_user.id,
        payload={"result_summary": stage.result_summary},
    )

    req.updated_at = now
    await request_repository.update(session, req)
    await session.commit()

    out = await _reload_request(session, request_id)
    assert out is not None
    return out


async def block_stage(
    session: AsyncSession,
    request_id: int,
    stage_id: uuid.UUID,
    payload: BlockStagePayload,
    current_user: User,
) -> Request:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization")

    await _ensure_org_member(session, req.organization_id, current_user.id)

    stage = await request_stage_repository.get_stage(session, stage_id)
    if stage is None or stage.request_id != request_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    active = find_active_stage(_ordered_stages(req))
    if active is None or active.id != stage.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only the active stage can be blocked",
        )

    stage.status = C.STAGE_BLOCKED
    stage.blocked_reason = payload.reason

    apply_derived_execution_fields(req, _ordered_stages(req))

    await append_event(
        session,
        request_id=request_id,
        stage_id=stage.id,
        event_type=C.EVENT_BLOCK,
        actor_user_id=current_user.id,
        payload={"reason": payload.reason},
    )

    req.updated_at = datetime.now(timezone.utc)
    await request_repository.update(session, req)
    await session.commit()

    out = await _reload_request(session, request_id)
    assert out is not None
    return out


async def unblock_stage(
    session: AsyncSession,
    request_id: int,
    stage_id: uuid.UUID,
    payload: UnblockStagePayload | None,
    current_user: User,
) -> Request:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No organization")

    await _ensure_org_member(session, req.organization_id, current_user.id)

    stage = await request_stage_repository.get_stage(session, stage_id)
    if stage is None or stage.request_id != request_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    if stage.status != C.STAGE_BLOCKED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stage is not blocked",
        )

    stage.blocked_reason = None
    if stage.assignee_kind in ("internal", "external") and (
        stage.assignee_internal_user_id or stage.assignee_external_contractor_id
    ):
        stage.status = C.STAGE_IN_PROGRESS
    else:
        stage.status = C.STAGE_WAITING_ASSIGNMENT

    apply_derived_execution_fields(req, _ordered_stages(req))

    await append_event(
        session,
        request_id=request_id,
        stage_id=stage.id,
        event_type=C.EVENT_UNBLOCK,
        actor_user_id=current_user.id,
        payload={},
    )

    req.updated_at = datetime.now(timezone.utc)
    await request_repository.update(session, req)
    await session.commit()

    out = await _reload_request(session, request_id)
    assert out is not None
    return out


async def list_stages(session: AsyncSession, request_id: int, user: User) -> list[RequestStageResponse]:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id:
        await _ensure_org_member(session, req.organization_id, user.id)

    rows = await request_stage_repository.list_stages_for_request(session, request_id)
    return [stage_to_response(s) for s in rows]


async def list_events(
    session: AsyncSession, request_id: int, user: User
) -> list[RequestExecutionEventResponse]:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id:
        await _ensure_org_member(session, req.organization_id, user.id)

    rows = await request_stage_repository.list_execution_events(session, request_id, limit=100)
    return [event_to_response(e) for e in rows]

