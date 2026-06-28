import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_execution as C
from app.constants import request_workflow as W
from app.models.request import Request
from app.models.user import User
from app.repositories import request_history_repository, request_repository, request_stage_repository
from app.services import request_execution_service
from app.services import request_analysis_service, request_summary_service
from app.services import request_task_service, request_workflow_service
from app.services import access_control, request_permissions as perms
from app.services.request_analysis_parser import normalize_legacy_stored_payload
from app.schemas.request import (
    AIRequestAnalysisResponse,
    AISummaryResponse,
    CreateRequestPayload,
    RequestPersonResponse,
    RequestResponse,
    UpdateRequestPayload,
)
from app.schemas.user import PublicAuthorResponse

logger = logging.getLogger(__name__)


def _to_author(author: User | None) -> PublicAuthorResponse | None:
    if author is None:
        return None
    return PublicAuthorResponse(
        id=str(author.id),
        first_name=author.first_name,
        last_name=author.last_name,
        middle_name=author.middle_name,
        email=author.email,
    )


def _to_ai_summary(data: dict | None) -> AISummaryResponse | None:
    if not data:
        return None
    return AISummaryResponse(
        summary=data.get("summary", ""),
        priority=data.get("priority", "medium"),
        tags=data.get("tags", []),
    )


def _to_ai_analysis(data: dict | None) -> AIRequestAnalysisResponse | None:
    if not data or not isinstance(data, dict):
        return None
    normalized = normalize_legacy_stored_payload(data)
    return AIRequestAnalysisResponse.model_validate(normalized)


def _build_people(req: Request) -> list[RequestPersonResponse]:
    people: list[RequestPersonResponse] = []

    if req.author is not None:
        name_parts = [req.author.last_name, req.author.first_name, req.author.middle_name]
        name = " ".join(p for p in name_parts if p) or "Пользователь"
        people.append(RequestPersonResponse(
            role="author",
            name=name,
            email=req.author.email,
            source="internal",
        ))
    elif req.applicant_name:
        people.append(RequestPersonResponse(
            role="author",
            name=req.applicant_name,
            email=req.applicant_email,
            phone=req.applicant_phone,
            source="public_link",
        ))

    return people


def _assigned_performer_id(req: Request) -> str | None:
    if req.assigned_kind == "internal" and req.assigned_internal_user_id:
        return f"internal:{req.assigned_internal_user_id}"
    if req.assigned_kind == "external" and req.assigned_external_contractor_id:
        return f"external:{req.assigned_external_contractor_id}"
    return None


def _to_response(
    req: Request,
    *,
    include_stages: bool = False,
    execution_events_rows: list | None = None,
    include_workflow: bool = False,
) -> RequestResponse:
    stages_out: list = []
    if include_stages and req.stages is not None:
        ordered = sorted(req.stages, key=lambda s: s.sequence)
        stages_out = [request_execution_service.stage_to_response(s) for s in ordered]

    events_out: list = []
    if execution_events_rows is not None:
        events_out = [
            request_execution_service.event_to_response(e) for e in execution_events_rows
        ]

    tasks_out: list = []
    history_out: list = []
    if include_workflow:
        if req.tasks is not None:
            tasks_out = [request_task_service.task_to_response(t) for t in sorted(req.tasks, key=lambda t: t.order_index)]
        if req.history_events is not None:
            sorted_history = sorted(req.history_events, key=lambda e: e.created_at, reverse=True)
            history_out = [request_workflow_service.history_to_response(e) for e in sorted_history]

    return RequestResponse(
        id=str(req.id),
        title=req.title,
        form_id=str(req.form_id),
        organization_id=str(req.organization_id) if req.organization_id else None,
        data=req.data,
        status=req.status,
        deleted=bool(getattr(req, "deleted", False)),
        closedAt=req.closed_at.isoformat() if req.closed_at else None,
        created_by_user_id=str(req.created_by_user_id) if req.created_by_user_id else None,
        author=_to_author(req.author),
        created_at=req.created_at.isoformat(),
        updated_at=req.updated_at.isoformat(),
        form_snapshot=req.form_snapshot,
        ai_summary=_to_ai_summary(req.ai_summary),
        ai_analysis=_to_ai_analysis(req.ai_analysis),
        source=req.source,
        applicant_name=req.applicant_name,
        applicant_company=req.applicant_company,
        applicant_email=req.applicant_email,
        applicant_phone=req.applicant_phone,
        people=_build_people(req),
        assigned_kind=req.assigned_kind,
        assigned_performer_id=_assigned_performer_id(req),
        execution_status=req.execution_status,
        stages=stages_out,
        execution_events=events_out,
        workflow_status=getattr(req, "workflow_status", W.WF_NEW),
        priority=getattr(req, "priority", W.PRIORITY_MEDIUM),
        due_date=req.due_date.isoformat() if getattr(req, "due_date", None) else None,
        responsible_user_id=str(req.responsible_user_id) if getattr(req, "responsible_user_id", None) else None,
        responsible_user=_to_author(req.responsible_user) if getattr(req, "responsible_user", None) else None,
        tasks=tasks_out,
        history=history_out,
        ai_tz=req.ai_tz,
    )


def map_request_to_response(
    req: Request,
    *,
    include_stages: bool = False,
    execution_events_rows: list | None = None,
    include_workflow: bool = False,
) -> RequestResponse:
    return _to_response(
        req,
        include_stages=include_stages,
        execution_events_rows=execution_events_rows,
        include_workflow=include_workflow,
    )


async def _load_request_for_basic_access(
    session: AsyncSession,
    request_id: int,
    user: User,
) -> Request:
    req, member = await perms.load_request_with_access(
        session, request_id, user, require_org=False
    )
    if not perms.can_view_request(req, user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return req


async def list_requests(
    session: AsyncSession,
    current_user: User,
    organization_id: uuid.UUID | None = None,
    archived: bool | None = None,
    mine: bool = False,
    status: str | None = None,
) -> list[RequestResponse]:
    organization_ids: list[uuid.UUID] | None = None
    if organization_id is not None:
        await access_control.ensure_organization_member(session, organization_id, current_user)
    elif not mine:
        organization_ids = await access_control.list_accessible_organization_ids(
            session, current_user
        )

    requests = await request_repository.get_all_filtered(
        session,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=archived,
        created_by_user_id=current_user.id if mine else None,
        status=status,
    )
    return [_to_response(r, include_stages=False) for r in requests]


async def get_counts(
    session: AsyncSession,
    organization_id: uuid.UUID | None,
    current_user: User,
) -> dict[str, int]:
    organization_ids: list[uuid.UUID] | None = None
    if organization_id is not None:
        await access_control.ensure_organization_member(session, organization_id, current_user)
    else:
        organization_ids = await access_control.list_accessible_organization_ids(
            session, current_user
        )

    open_count = await request_repository.count_filtered(
        session,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=False,
        status="open",
    )
    in_progress_count = await request_repository.count_filtered(
        session,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=False,
        status="assigned",
    )
    closed_count = await request_repository.count_filtered(
        session,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=False,
        status="closed",
    )
    archived_count = await request_repository.count_filtered(
        session,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=True,
    )
    return {
        "open": open_count,
        "in_progress": in_progress_count,
        "closed": closed_count,
        "archived": archived_count,
    }


async def get_request(
    session: AsyncSession, request_id: int, current_user: User
) -> RequestResponse:
    req = await _load_request_for_basic_access(session, request_id, current_user)
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return _to_response(
        req,
        include_stages=True,
        execution_events_rows=events,
        include_workflow=True,
    )


async def create_request(
    session: AsyncSession, payload: CreateRequestPayload, current_user: User
) -> RequestResponse:
    org_id = uuid.UUID(payload.organization_id) if payload.organization_id else None
    if org_id is not None:
        await access_control.ensure_organization_member(session, org_id, current_user)

    req = Request(
        title=payload.title,
        form_id=uuid.UUID(payload.form_id),
        created_by_user_id=current_user.id,
        organization_id=org_id,
        data=payload.data,
        status=payload.status if payload.status != "open" else "open",
        workflow_status=W.WF_NEW if payload.status == "open" else W.WF_DRAFT,
        deleted=False,
        execution_status=C.EXEC_NEW,
        form_snapshot=payload.form_snapshot,
    )
    req = await request_repository.create(session, req)
    await request_workflow_service.log_request_created(session, req.id, current_user.id)
    await session.commit()
    request_id = req.id

    try:
        await request_summary_service.generate_summary(session, request_id)
    except Exception:
        logger.exception("AI summary generation failed for request %s", request_id)
        await session.rollback()

    try:
        await request_analysis_service.generate_analysis(session, request_id)
    except request_analysis_service.AnalysisGenerationFailed:
        logger.warning("AI analysis skipped (LLM unavailable) for request %s", request_id)
        await session.rollback()
    except Exception:
        logger.exception("AI analysis generation failed for request %s", request_id)
        await session.rollback()

    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return _to_response(req, include_stages=True, execution_events_rows=events)


async def update_request(
    session: AsyncSession, request_id: int, payload: UpdateRequestPayload, current_user: User
) -> RequestResponse:
    req = await _load_request_for_basic_access(session, request_id, current_user)

    if payload.title is not None:
        req.title = payload.title
    if payload.data is not None:
        req.data = payload.data
    if payload.status is not None:
        req.status = payload.status
    if payload.closedAt is not None:
        req.closed_at = datetime.fromisoformat(payload.closedAt)
    req.updated_at = datetime.now(timezone.utc)

    req = await request_repository.update(session, req)
    await session.commit()
    req = await request_repository.get_by_id(session, request_id)
    assert req is not None
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return _to_response(req, include_stages=True, execution_events_rows=events)


async def patch_status(
    session: AsyncSession, request_id: int, new_status: str, current_user: User
) -> RequestResponse:
    req = await _load_request_for_basic_access(session, request_id, current_user)

    req.status = new_status
    if new_status == "closed":
        req.closed_at = datetime.now(timezone.utc)
    req.updated_at = datetime.now(timezone.utc)

    req = await request_repository.update(session, req)
    await session.commit()
    req = await request_repository.get_by_id(session, request_id)
    assert req is not None
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return _to_response(req, include_stages=True, execution_events_rows=events)


async def delete_request(session: AsyncSession, request_id: int, current_user: User) -> None:
    await _load_request_for_basic_access(session, request_id, current_user)
    deleted = await request_repository.remove(session, request_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    await session.commit()
