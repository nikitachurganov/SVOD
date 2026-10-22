import logging
import uuid

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.performer_selection import (
    AssignRequestPayload,
    PerformerRecommendationResponse,
)
from app.schemas.request import (
    AIRequestAnalysisResponse,
    AISummaryResponse,
    CreateRequestPayload,
    PatchRequestAttributesPayload,
    PatchStatusPayload,
    PatchResponsiblePayload,
    RequestResponse,
    UpdateRequestPayload,
)
from app.schemas.request_execution import (
    AddRequestStagePayload,
    BlockStagePayload,
    CompleteStagePayload,
    PatchRequestStagePayload,
    RequestExecutionEventResponse,
    RequestStageResponse,
    UnblockStagePayload,
    ReorderStagesPayload,
    AddStageLinkPayload,
    RequestStageArtifactResponse,
    PatchStageTechnicalSpecPayload,
    RequestTimelineResponse,
    StageTechnicalSpecResponse,
)
from app.schemas.request_ai import AIJobResponse, ApplyAIStagePlanPayload
from app.schemas.request_tz import PatchRequestTZPayload, RequestTZResponse
from app.schemas.request_workflow import (
    CreateRequestTaskPayload,
    PatchRequestTaskAssigneePayload,
    PatchRequestTaskStatusPayload,
    PatchWorkflowStatusPayload,
    RequestHistoryEventResponse,
    RequestTaskResponse,
    UpdateRequestTaskPayload,
    WorkflowStatusSuggestion,
    RequestCommentPayload,
)
from app.services import (
    performer_selection_service,
    request_analysis_service,
    request_execution_service,
    request_service,
    request_summary_service,
    request_task_service,
    request_tz_service,
    request_workflow_service,
    request_lifecycle_service,
    stage_artifact_service,
    ai_job_service,
    request_stage_plan_service,
    request_permissions,
    request_timeline_service,
    stage_specification_service,
)

router = APIRouter()
_route_log = logging.getLogger(__name__)


@router.get("", response_model=list[RequestResponse])
async def list_requests(
    session: DbSession,
    user: CurrentUser,
    organization_id: uuid.UUID | None = Query(default=None),
    archived: bool | None = Query(default=None),
    mine: bool = Query(default=False),
    status: str | None = Query(default=None),
    workflow_status: str | None = Query(default=None),
    free: bool = Query(default=False, description="Only new requests without a responsible user"),
    mine_responsible: bool = Query(default=False, description="Only requests where I am responsible"),
) -> list[RequestResponse]:
    return await request_service.list_requests(
        session,
        user,
        organization_id=organization_id,
        archived=archived,
        mine_user_id=user.id if mine else None,
        workflow_statuses=[item.strip() for item in workflow_status.split(",") if item.strip()]
        if workflow_status
        else None,
        legacy_status=status,
        responsible_user_id=user.id if mine_responsible else None,
        without_responsible=free,
    )


@router.get("/counts")
async def requests_counts(
    session: DbSession,
    user: CurrentUser,
    organization_id: uuid.UUID | None = Query(default=None),
) -> dict[str, int]:
    return await request_service.get_counts(session, organization_id, user)


@router.get("/{request_id}", response_model=RequestResponse)
async def get_request(
    request_id: int, session: DbSession, user: CurrentUser
) -> RequestResponse:
    return await request_service.get_request(session, request_id, user)


@router.get("/{request_id}/timeline", response_model=RequestTimelineResponse)
async def get_request_timeline(
    request_id: int,
    session: DbSession,
    user: CurrentUser,
    limit: int = Query(default=200, ge=1, le=500),
) -> RequestTimelineResponse:
    """Auditable stage dossiers: specification, handoffs, dates, files and events."""
    return await request_timeline_service.get_timeline(session, request_id, user, limit=limit)


@router.post("", response_model=RequestResponse, status_code=201)
async def create_request(
    payload: CreateRequestPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    return await request_service.create_request(session, payload, user)


@router.put("/{request_id}", response_model=RequestResponse)
async def update_request(
    request_id: int,
    payload: UpdateRequestPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    return await request_service.update_request(session, request_id, payload, user)


@router.patch("/{request_id}/status", response_model=RequestResponse, deprecated=True)
async def patch_status(
    request_id: int,
    payload: PatchStatusPayload,
    session: DbSession,
    _user: CurrentUser,
) -> RequestResponse:
    return await request_service.patch_status(session, request_id, payload.status)


@router.patch("/{request_id}/workflow-status", response_model=RequestResponse, deprecated=True)
async def patch_workflow_status(
    request_id: int,
    payload: PatchWorkflowStatusPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    await request_workflow_service.change_workflow_status(
        session, request_id, payload, user
    )
    return await request_service.get_request(session, request_id, user)


@router.get("/{request_id}/workflow-suggestion", response_model=WorkflowStatusSuggestion | None)
async def get_workflow_suggestion(
    request_id: int,
    session: DbSession,
    user: CurrentUser,
) -> WorkflowStatusSuggestion | None:
    return await request_workflow_service.suggest_workflow_status(session, request_id, user)


@router.get("/{request_id}/history", response_model=list[RequestHistoryEventResponse])
async def list_request_history(
    request_id: int,
    session: DbSession,
    user: CurrentUser,
) -> list[RequestHistoryEventResponse]:
    return await request_workflow_service.list_history(session, request_id, user)


@router.get("/{request_id}/tasks", response_model=list[RequestTaskResponse], deprecated=True)
async def list_request_tasks(
    request_id: int,
    session: DbSession,
    user: CurrentUser,
) -> list[RequestTaskResponse]:
    return await request_task_service.list_tasks(session, request_id, user)


@router.post("/{request_id}/tasks", response_model=RequestTaskResponse, status_code=201, deprecated=True)
async def create_request_task(
    request_id: int,
    payload: CreateRequestTaskPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestTaskResponse:
    return await request_task_service.create_task(session, request_id, payload, user)


@router.patch("/{request_id}/tasks/{task_id}", response_model=RequestTaskResponse, deprecated=True)
async def update_request_task(
    request_id: int,
    task_id: uuid.UUID,
    payload: UpdateRequestTaskPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestTaskResponse:
    return await request_task_service.update_task(session, request_id, task_id, payload, user)


@router.patch("/{request_id}/tasks/{task_id}/status", response_model=RequestTaskResponse, deprecated=True)
async def patch_request_task_status(
    request_id: int,
    task_id: uuid.UUID,
    payload: PatchRequestTaskStatusPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestTaskResponse:
    return await request_task_service.patch_task_status(
        session, request_id, task_id, payload, user
    )


@router.patch("/{request_id}/tasks/{task_id}/assignee", response_model=RequestTaskResponse, deprecated=True)
async def patch_request_task_assignee(
    request_id: int,
    task_id: uuid.UUID,
    payload: PatchRequestTaskAssigneePayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestTaskResponse:
    return await request_task_service.patch_task_assignee(
        session, request_id, task_id, payload, user
    )


@router.delete("/{request_id}/tasks/{task_id}", response_model=RequestTaskResponse, deprecated=True)
async def cancel_request_task(
    request_id: int,
    task_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> RequestTaskResponse:
    return await request_task_service.delete_task(session, request_id, task_id, user)


@router.post(
    "/{request_id}/analysis",
    response_model=AIJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def generate_request_analysis(
    request_id: int,
    session: DbSession,
    user: CurrentUser,
) -> AIJobResponse:
    request, member = await request_permissions.load_request_with_access(
        session, request_id, user, require_org=False
    )
    if not request_permissions.can_manage_request(request, user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    job = await ai_job_service.enqueue(
        session, request_id, ai_job_service.JOB_ANALYSIS, force=True
    )
    return ai_job_service.to_response(job)


@router.post("/{request_id}/summary", response_model=AISummaryResponse)
async def generate_summary(
    request_id: int,
    session: DbSession,
    _user: CurrentUser,
) -> AISummaryResponse:
    await request_service.get_request(session, request_id, _user)
    try:
        result = await request_summary_service.generate_summary(session, request_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return AISummaryResponse(**result)


@router.get("/{request_id}/summary", response_model=AISummaryResponse | None)
async def get_summary(
    request_id: int,
    session: DbSession,
    _user: CurrentUser,
) -> AISummaryResponse | None:
    await request_service.get_request(session, request_id, _user)
    try:
        data = await request_summary_service.get_summary(session, request_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if data is None:
        return None
    return AISummaryResponse(**data)


@router.delete("/{request_id}", status_code=204)
async def delete_request(
    request_id: int, session: DbSession, user: CurrentUser
) -> None:
    await request_service.delete_request(session, request_id, user)


@router.post("/{request_id}/tz", response_model=RequestTZResponse)
async def generate_request_tz(
    request_id: int,
    session: DbSession,
    user: CurrentUser,
) -> RequestTZResponse:
    try:
        return await request_tz_service.generate_tz(session, request_id, user)
    except request_tz_service.TZGenerationFailed as exc:
        _route_log.warning("TZ generation failed for %s: %s", request_id, exc.message)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )


@router.patch("/{request_id}/tz", response_model=RequestTZResponse)
async def patch_request_tz(
    request_id: int,
    payload: PatchRequestTZPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestTZResponse:
    return await request_tz_service.patch_tz(session, request_id, user, payload)


@router.get("/{request_id}/performers", response_model=PerformerRecommendationResponse)
async def get_request_performers(
    request_id: int,
    session: DbSession,
    user: CurrentUser,
) -> PerformerRecommendationResponse:
    result = await performer_selection_service.get_recommended_performers(
        session, request_id, user
    )
    return PerformerRecommendationResponse.model_validate(result)


@router.get(
    "/{request_id}/stages/{stage_id}/performers",
    response_model=PerformerRecommendationResponse,
)
async def get_stage_performers(
    request_id: int,
    stage_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> PerformerRecommendationResponse:
    result = await performer_selection_service.get_recommended_performers(
        session, request_id, user, stage_id=stage_id
    )
    return PerformerRecommendationResponse.model_validate(result)


@router.post("/{request_id}/assign", response_model=RequestResponse, deprecated=True)
async def assign_request_performer(
    request_id: int,
    payload: AssignRequestPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    await performer_selection_service.assign_performer(
        session, request_id, payload, user
    )
    return await request_service.get_request(session, request_id, user)


@router.patch("/{request_id}/responsible", response_model=RequestResponse)
async def patch_request_responsible(
    request_id: int,
    payload: PatchResponsiblePayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    try:
        responsible_id = uuid.UUID(payload.responsible_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid responsible user id") from exc
    await request_lifecycle_service.assign_responsible(
        session, request_id, responsible_id, user
    )
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/take", response_model=RequestResponse)
async def take_request(
    request_id: int, session: DbSession, user: CurrentUser
) -> RequestResponse:
    await request_lifecycle_service.take_request(session, request_id, user)
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/release", response_model=RequestResponse)
async def release_request(
    request_id: int, payload: RequestCommentPayload, session: DbSession, user: CurrentUser
) -> RequestResponse:
    await request_lifecycle_service.release_request(
        session, request_id, user, reason=payload.comment
    )
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/self-execute", response_model=RequestResponse)
async def self_execute_request(
    request_id: int, session: DbSession, user: CurrentUser
) -> RequestResponse:
    await request_lifecycle_service.self_execute_request(session, request_id, user)
    return await request_service.get_request(session, request_id, user)


@router.patch("/{request_id}/attributes", response_model=RequestResponse)
async def patch_request_attributes(
    request_id: int,
    payload: PatchRequestAttributesPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    await request_lifecycle_service.update_attributes(
        session,
        request_id,
        user,
        fields=set(payload.model_fields_set),
        priority=payload.priority,
        due_date=payload.due_date,
    )
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/start", response_model=RequestResponse)
async def start_request(
    request_id: int, session: DbSession, user: CurrentUser
) -> RequestResponse:
    await request_lifecycle_service.start_request(session, request_id, user)
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/close", response_model=RequestResponse)
async def close_request_v2(
    request_id: int, session: DbSession, user: CurrentUser
) -> RequestResponse:
    await request_lifecycle_service.close_request(session, request_id, user)
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/cancel", response_model=RequestResponse)
async def cancel_request_v2(
    request_id: int, payload: RequestCommentPayload, session: DbSession, user: CurrentUser
) -> RequestResponse:
    await request_lifecycle_service.cancel_request(session, request_id, user, reason=payload.comment)
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/request-info", response_model=RequestResponse)
async def request_more_information(
    request_id: int, payload: RequestCommentPayload, session: DbSession, user: CurrentUser
) -> RequestResponse:
    await request_lifecycle_service.request_more_information(
        session, request_id, user, comment=payload.comment
    )
    return await request_service.get_request(session, request_id, user)


@router.get("/ai-jobs/{job_id}", response_model=AIJobResponse)
async def get_ai_job(
    job_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> AIJobResponse:
    return await ai_job_service.get_job(session, job_id, user)


@router.post(
    "/{request_id}/stage-plan/suggest",
    response_model=AIJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def suggest_stage_plan(
    request_id: int, session: DbSession, user: CurrentUser
) -> AIJobResponse:
    request, member = await request_permissions.load_request_with_access(
        session, request_id, user
    )
    if not request_permissions.can_manage_plan(request, user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    job = await ai_job_service.enqueue(
        session, request_id, ai_job_service.JOB_STAGE_PLAN, force=True
    )
    return ai_job_service.to_response(job)


@router.post("/{request_id}/stage-plan/apply", response_model=RequestResponse)
async def apply_stage_plan(
    request_id: int,
    payload: ApplyAIStagePlanPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    await request_stage_plan_service.apply_stage_plan(
        session, request_id, payload, user
    )
    return await request_service.get_request(session, request_id, user)


@router.get("/{request_id}/stages", response_model=list[RequestStageResponse])
async def list_request_stages(
    request_id: int,
    session: DbSession,
    user: CurrentUser,
) -> list[RequestStageResponse]:
    return await request_execution_service.list_stages(session, request_id, user)


@router.get("/{request_id}/execution-events", response_model=list[RequestExecutionEventResponse])
async def list_request_execution_events(
    request_id: int,
    session: DbSession,
    user: CurrentUser,
) -> list[RequestExecutionEventResponse]:
    return await request_execution_service.list_events(session, request_id, user)


@router.post("/{request_id}/stages", response_model=RequestResponse)
async def add_request_stage(
    request_id: int,
    payload: AddRequestStagePayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    await request_execution_service.add_stage(session, request_id, payload, user)
    return await request_service.get_request(session, request_id, user)


@router.put("/{request_id}/stages/order", response_model=RequestResponse)
async def reorder_request_stages(
    request_id: int,
    payload: ReorderStagesPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    await request_execution_service.reorder_stages(
        session, request_id, payload.stage_ids, user
    )
    return await request_service.get_request(session, request_id, user)


@router.patch("/{request_id}/stages/{stage_id}", response_model=RequestResponse)
async def patch_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    payload: PatchRequestStagePayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    await request_execution_service.patch_stage(session, request_id, stage_id, payload, user)
    return await request_service.get_request(session, request_id, user)


@router.post(
    "/{request_id}/stages/{stage_id}/specification/generate",
    response_model=AIJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def generate_stage_specification(
    request_id: int, stage_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> AIJobResponse:
    _request, _stage = await stage_specification_service._load_manageable_stage(session, request_id, stage_id, user)
    job = await stage_specification_service.enqueue_generation(session, request_id, stage_id, force=True)
    return ai_job_service.to_response(job)


@router.post(
    "/{request_id}/stages/{stage_id}/specification",
    response_model=StageTechnicalSpecResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_stage_specification(
    request_id: int, stage_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> StageTechnicalSpecResponse:
    return await stage_specification_service.create_manual_specification(session, request_id, stage_id, user)


@router.patch(
    "/{request_id}/stages/{stage_id}/specification/{specification_id}",
    response_model=StageTechnicalSpecResponse,
)
async def patch_stage_specification(
    request_id: int, stage_id: uuid.UUID, specification_id: uuid.UUID,
    payload: PatchStageTechnicalSpecPayload, session: DbSession, user: CurrentUser,
) -> StageTechnicalSpecResponse:
    return await stage_specification_service.patch_specification(
        session, request_id, stage_id, specification_id, payload, user
    )


@router.post(
    "/{request_id}/stages/{stage_id}/specification/{specification_id}/confirm",
    response_model=StageTechnicalSpecResponse,
)
async def confirm_stage_specification(
    request_id: int, stage_id: uuid.UUID, specification_id: uuid.UUID,
    session: DbSession, user: CurrentUser,
) -> StageTechnicalSpecResponse:
    return await stage_specification_service.confirm_specification(
        session, request_id, stage_id, specification_id, user
    )


@router.delete("/{request_id}/stages/{stage_id}", response_model=RequestResponse)
async def delete_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    await request_execution_service.delete_stage(session, request_id, stage_id, user)
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/stages/{stage_id}/assign", response_model=RequestResponse)
async def assign_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    payload: AssignRequestPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    await request_execution_service.assign_stage(session, request_id, stage_id, payload, user)
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/stages/{stage_id}/complete", response_model=RequestResponse)
async def complete_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
    payload: CompleteStagePayload | None = None,
) -> RequestResponse:
    await request_execution_service.complete_stage(
        session, request_id, stage_id, payload, user
    )
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/stages/{stage_id}/block", response_model=RequestResponse)
async def block_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    payload: BlockStagePayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    await request_execution_service.block_stage(session, request_id, stage_id, payload, user)
    return await request_service.get_request(session, request_id, user)


@router.post("/{request_id}/stages/{stage_id}/unblock", response_model=RequestResponse)
async def unblock_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
    payload: UnblockStagePayload | None = None,
) -> RequestResponse:
    await request_execution_service.unblock_stage(session, request_id, stage_id, payload, user)
    return await request_service.get_request(session, request_id, user)


@router.post(
    "/{request_id}/stages/{stage_id}/artifacts/files",
    response_model=RequestStageArtifactResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_stage_artifact(
    request_id: int,
    stage_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
    purpose: str = Form("input"),
) -> RequestStageArtifactResponse:
    return await stage_artifact_service.upload_file(
        session, request_id, stage_id, file, user, purpose=purpose
    )


@router.post(
    "/{request_id}/stages/{stage_id}/artifacts/links",
    response_model=RequestStageArtifactResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_stage_artifact_link(
    request_id: int,
    stage_id: uuid.UUID,
    payload: AddStageLinkPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestStageArtifactResponse:
    return await stage_artifact_service.add_link(
        session, request_id, stage_id, payload, user
    )


@router.get("/{request_id}/stages/{stage_id}/artifacts/{artifact_id}/download-url")
async def get_stage_artifact_download_url(
    request_id: int,
    stage_id: uuid.UUID,
    artifact_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> dict[str, str]:
    url = await stage_artifact_service.get_download_url(
        session, request_id, stage_id, artifact_id, user
    )
    return {"url": url}


@router.delete(
    "/{request_id}/stages/{stage_id}/artifacts/{artifact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_stage_artifact(
    request_id: int,
    stage_id: uuid.UUID,
    artifact_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> Response:
    await stage_artifact_service.delete_artifact(
        session, request_id, stage_id, artifact_id, user
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
