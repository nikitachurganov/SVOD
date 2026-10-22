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
from app.services import ai_job_service, notification_service
from app.repositories import organization_repository
from app.services.request_analysis_parser import normalize_legacy_stored_payload
from app.schemas.request import (
    AIRequestAnalysisResponse,
    AISummaryResponse,
    CreateRequestPayload,
    RequestPersonResponse,
    RequestResponse,
    UpdateRequestPayload,
    RequestPermissionsResponse,
    RequestProgressResponse,
)
from app.schemas.user import PublicAuthorResponse
from app.models.organization import OrganizationMember
from app.services import request_permissions as perms
from app.core.config import settings

logger = logging.getLogger(__name__)

_LEGACY_STATUS_FILTERS: dict[str, list[str]] = {
    "open": [W.WF_DRAFT, W.WF_NEW, W.WF_WAITING_INFO, W.WF_PLANNING],
    "assigned": [W.WF_IN_PROGRESS],
    "closed": [W.WF_COMPLETED, W.WF_CLOSED, W.WF_CANCELLED],
}


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
    current_user: User | None = None,
    member: OrganizationMember | None = None,
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

    ordered_stages = sorted(req.stages, key=lambda s: s.sequence) if req.stages else []
    relevant_stages = [stage for stage in ordered_stages if stage.status != C.STAGE_CANCELLED]
    active_stage = request_execution_service.find_active_stage(relevant_stages)
    permissions = RequestPermissionsResponse()
    if current_user is not None:
        can_manage = perms.can_manage_request(req, current_user, member)
        can_manage_plan = can_manage and req.workflow_status not in (
            W.WF_CLOSED,
            W.WF_CANCELLED,
            W.WF_ARCHIVED,
        )
        can_act = perms.can_act_on_stage(req, active_stage, current_user, member)
        first_stage = active_stage
        first_has_assignee = bool(
            first_stage
            and (
                (
                    first_stage.assignee_kind == "internal"
                    and first_stage.assignee_internal_user_id is not None
                )
                or (
                    first_stage.assignee_kind == "external"
                    and first_stage.assignee_external_contractor_id is not None
                )
            )
        )
        permissions = RequestPermissionsResponse(
            can_assign_responsible=perms.can_assign_responsible(member)
            and req.workflow_status not in (W.WF_CLOSED, W.WF_CANCELLED, W.WF_ARCHIVED),
            can_manage_plan=can_manage_plan,
            can_start=bool(
                can_manage
                and req.workflow_status == W.WF_PLANNING
                and req.responsible_user_id is not None
                and first_has_assignee
            ),
            can_close=can_manage and req.workflow_status == W.WF_COMPLETED,
            can_cancel=can_manage and req.workflow_status not in (W.WF_CLOSED, W.WF_CANCELLED, W.WF_ARCHIVED),
            can_delete=can_manage and req.workflow_status in (W.WF_CLOSED, W.WF_CANCELLED),
            can_complete_active_stage=bool(
                can_act
                and req.workflow_status == W.WF_IN_PROGRESS
                and active_stage is not None
                and active_stage.status == C.STAGE_IN_PROGRESS
            ),
            can_block_active_stage=bool(
                can_act
                and req.workflow_status == W.WF_IN_PROGRESS
                and active_stage is not None
                and active_stage.status == C.STAGE_IN_PROGRESS
            ),
            can_unblock_active_stage=bool(
                can_manage
                and req.workflow_status == W.WF_IN_PROGRESS
                and active_stage is not None
                and active_stage.status == C.STAGE_BLOCKED
            ),
            can_take=perms.can_take_request(req, member),
            can_release=perms.can_release_request(req, current_user),
            can_self_execute=bool(
                perms.can_take_request(req, member)
                or (
                    perms.is_responsible(req, current_user)
                    and req.workflow_status == W.WF_PLANNING
                )
            ),
            can_edit_attributes=can_manage_plan,
        )

    ai_stage_plan = None
    if req.ai_stage_plan is not None:
        ai_stage_plan = {
            "status": req.ai_stage_plan.status,
            "source_fingerprint": req.ai_stage_plan.source_fingerprint,
            "stages": (req.ai_stage_plan.proposal or {}).get("stages", []),
            "generated_at": req.ai_stage_plan.generated_at.isoformat(),
        }

    analysis_jobs = [job for job in getattr(req, "ai_jobs", []) if job.kind == ai_job_service.JOB_ANALYSIS]
    latest_analysis_job = max(analysis_jobs, key=lambda job: job.created_at) if analysis_jobs else None

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
        progress=RequestProgressResponse(
            completed=sum(1 for stage in relevant_stages if stage.status == C.STAGE_DONE),
            total=len(relevant_stages),
        ),
        permissions=permissions,
        ai_analysis_status=(
            latest_analysis_job.status
            if latest_analysis_job is not None
            else ("succeeded" if req.ai_analysis else "not_generated")
        ),
        ai_stage_plan=ai_stage_plan,
    )


def map_request_to_response(
    req: Request,
    *,
    include_stages: bool = False,
    execution_events_rows: list | None = None,
    include_workflow: bool = False,
    current_user: User | None = None,
    member: OrganizationMember | None = None,
) -> RequestResponse:
    return _to_response(
        req,
        include_stages=include_stages,
        execution_events_rows=execution_events_rows,
        include_workflow=include_workflow,
        current_user=current_user,
        member=member,
    )


async def list_requests(
    session: AsyncSession,
    current_user: User,
    organization_id: uuid.UUID | None = None,
    archived: bool | None = None,
    mine_user_id: uuid.UUID | None = None,
    workflow_statuses: list[str] | None = None,
    legacy_status: str | None = None,
    responsible_user_id: uuid.UUID | None = None,
    without_responsible: bool = False,
) -> list[RequestResponse]:
    selected_statuses = workflow_statuses
    if selected_statuses:
        unknown_statuses = set(selected_statuses) - W.WORKFLOW_STATUSES
        if unknown_statuses:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid workflow status: {sorted(unknown_statuses)[0]}",
            )
    elif legacy_status:
        selected_statuses = _LEGACY_STATUS_FILTERS.get(legacy_status)
        if selected_statuses is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unsupported legacy status filter; use workflow_status",
            )

    if without_responsible and not selected_statuses:
        # "Free" requests: nobody has taken them into work yet
        selected_statuses = [W.WF_NEW]

    organization_ids: list[uuid.UUID] | None = None
    if organization_id is not None:
        member = await organization_repository.get_member(session, organization_id, current_user.id)
        if member is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this organization")
    else:
        organizations = await organization_repository.get_orgs_for_user(session, current_user.id)
        organization_ids = [organization.id for organization in organizations]
    requests = await request_repository.get_all_filtered(
        session,
        organization_id=organization_id,
        archived=archived,
        created_by_user_id=mine_user_id,
        workflow_statuses=selected_statuses,
        organization_ids=organization_ids,
        viewer_user_id=current_user.id,
        responsible_user_id=responsible_user_id,
        without_responsible=without_responsible,
    )
    member_scope = [organization_id] if organization_id is not None else organization_ids
    memberships = await organization_repository.get_members_for_user(
        session, current_user.id, member_scope
    )
    members_by_org = {member.organization_id: member for member in memberships}
    return [
        _to_response(
            request,
            include_stages=False,
            current_user=current_user,
            member=members_by_org.get(request.organization_id),
        )
        for request in requests
    ]


async def get_counts(
    session: AsyncSession,
    organization_id: uuid.UUID | None,
    current_user: User,
) -> dict[str, int]:
    organization_ids: list[uuid.UUID] | None = None
    if organization_id is not None:
        member = await organization_repository.get_member(session, organization_id, current_user.id)
        if member is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this organization")
    else:
        organizations = await organization_repository.get_orgs_for_user(session, current_user.id)
        organization_ids = [organization.id for organization in organizations]
    open_count = await request_repository.count_filtered(
        session, organization_id=organization_id, organization_ids=organization_ids, viewer_user_id=current_user.id,
        archived=False, workflow_statuses=_LEGACY_STATUS_FILTERS["open"]
    )
    in_progress_count = await request_repository.count_filtered(
        session, organization_id=organization_id, organization_ids=organization_ids, viewer_user_id=current_user.id,
        archived=False, workflow_statuses=_LEGACY_STATUS_FILTERS["assigned"]
    )
    closed_count = await request_repository.count_filtered(
        session, organization_id=organization_id, organization_ids=organization_ids, viewer_user_id=current_user.id,
        archived=False, workflow_statuses=_LEGACY_STATUS_FILTERS["closed"]
    )
    archived_count = await request_repository.count_filtered(
        session, organization_id=organization_id, organization_ids=organization_ids, viewer_user_id=current_user.id, archived=True
    )
    return {
        "open": open_count,
        "in_progress": in_progress_count,
        "closed": closed_count,
        "archived": archived_count,
    }


async def get_request(session: AsyncSession, request_id: int, current_user: User) -> RequestResponse:
    req, member = await perms.load_request_with_access(session, request_id, current_user, require_org=False)
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return _to_response(
        req,
        include_stages=True,
        execution_events_rows=events,
        include_workflow=True,
        current_user=current_user,
        member=member,
    )


async def create_request(
    session: AsyncSession,
    payload: CreateRequestPayload,
    current_user: User,
    *,
    source: str | None = None,
    priority: str | None = None,
) -> RequestResponse:
    org_id = uuid.UUID(payload.organization_id) if payload.organization_id else None
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
        source=source,
        priority=priority if priority in W.PRIORITIES else W.PRIORITY_MEDIUM,
    )
    req = await request_repository.create(session, req)
    await request_workflow_service.log_request_created(session, req.id, current_user.id)
    await notification_service.notify_request_created(session, req, actor_user_id=current_user.id)
    await session.commit()
    request_id = req.id

    if settings.AI_JOBS_ENABLED:
        try:
            await ai_job_service.enqueue(session, request_id, ai_job_service.JOB_ANALYSIS)
            await ai_job_service.enqueue(session, request_id, ai_job_service.JOB_STAGE_PLAN)
        except Exception:
            logger.exception("Could not enqueue AI analysis for request %s", request_id)

    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    member = None
    if req.organization_id is not None:
        member = await organization_repository.get_member(session, req.organization_id, current_user.id)
    return _to_response(
        req,
        include_stages=True,
        execution_events_rows=events,
        current_user=current_user,
        member=member,
    )


async def update_request(
    session: AsyncSession, request_id: int, payload: UpdateRequestPayload, current_user: User
) -> RequestResponse:
    req, member = await perms.load_request_with_access(session, request_id, current_user, require_org=False)
    if not perms.can_manage_request(req, current_user, member) and not perms.can_edit_request_draft(req, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    content_changed = False

    if payload.title is not None:
        req.title = payload.title
        content_changed = True
    if payload.data is not None:
        req.data = payload.data
        content_changed = True
    if payload.closedAt is not None:
        req.closed_at = datetime.fromisoformat(payload.closedAt)
    if payload.priority is not None:
        if payload.priority not in W.PRIORITIES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid priority")
        req.priority = payload.priority
    if "due_date" in payload.model_fields_set:
        req.due_date = request_workflow_service._parse_iso_datetime(payload.due_date)
    req.updated_at = datetime.now(timezone.utc)

    req = await request_repository.update(session, req)
    await session.commit()
    if content_changed and settings.AI_JOBS_ENABLED:
        try:
            await ai_job_service.enqueue(session, request_id, ai_job_service.JOB_ANALYSIS)
            await ai_job_service.enqueue(session, request_id, ai_job_service.JOB_STAGE_PLAN)
        except Exception:
            logger.exception("Could not enqueue AI analysis for request %s", request_id)
    req = await request_repository.get_by_id(session, request_id)
    assert req is not None
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return _to_response(
        req,
        include_stages=True,
        execution_events_rows=events,
        current_user=current_user,
        member=member,
    )


async def patch_status(
    session: AsyncSession, request_id: int, new_status: str
) -> RequestResponse:
    req = await request_repository.get_by_id(session, request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Direct status updates are deprecated; use request lifecycle actions",
    )


async def delete_request(
    session: AsyncSession, request_id: int, current_user: User
) -> None:
    req, member = await perms.load_request_with_access(session, request_id, current_user, require_org=False)
    if not perms.can_manage_request(req, current_user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if req.workflow_status not in W.ARCHIVABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only closed or cancelled requests can be archived",
        )
    old_status = req.workflow_status
    req.deleted = True
    req.workflow_status = W.WF_ARCHIVED
    req.updated_at = datetime.now(timezone.utc)
    await request_history_repository.append_history(
        session,
        request_id=req.id,
        actor_id=current_user.id,
        event_type=W.HISTORY_REQUEST_STATUS_CHANGED,
        payload={"old_status": old_status, "new_status": W.WF_ARCHIVED},
    )
    await request_repository.update(session, req)
    await session.commit()
