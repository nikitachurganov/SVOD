import logging
import uuid

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DbSession
from app.repositories import request_stage_repository
from app.schemas.performer_selection import (
    AssignRequestPayload,
    PerformerRecommendationResponse,
)
from app.schemas.request import (
    AIRequestAnalysisResponse,
    AISummaryResponse,
    CreateRequestPayload,
    PatchStatusPayload,
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
)
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
) -> list[RequestResponse]:
    return await request_service.list_requests(
        session,
        current_user=user,
        organization_id=organization_id,
        archived=archived,
        mine=mine,
        status=status,
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


@router.patch("/{request_id}/status", response_model=RequestResponse)
async def patch_status(
    request_id: int,
    payload: PatchStatusPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    return await request_service.patch_status(session, request_id, payload.status, user)


@router.patch("/{request_id}/workflow-status", response_model=RequestResponse)
async def patch_workflow_status(
    request_id: int,
    payload: PatchWorkflowStatusPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    req = await request_workflow_service.change_workflow_status(
        session, request_id, payload, user
    )
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return request_service.map_request_to_response(
        req, include_stages=True, execution_events_rows=events, include_workflow=True
    )


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


@router.get("/{request_id}/tasks", response_model=list[RequestTaskResponse])
async def list_request_tasks(
    request_id: int,
    session: DbSession,
    user: CurrentUser,
) -> list[RequestTaskResponse]:
    return await request_task_service.list_tasks(session, request_id, user)


@router.post("/{request_id}/tasks", response_model=RequestTaskResponse, status_code=201)
async def create_request_task(
    request_id: int,
    payload: CreateRequestTaskPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestTaskResponse:
    return await request_task_service.create_task(session, request_id, payload, user)


@router.patch("/{request_id}/tasks/{task_id}", response_model=RequestTaskResponse)
async def update_request_task(
    request_id: int,
    task_id: uuid.UUID,
    payload: UpdateRequestTaskPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestTaskResponse:
    return await request_task_service.update_task(session, request_id, task_id, payload, user)


@router.patch("/{request_id}/tasks/{task_id}/status", response_model=RequestTaskResponse)
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


@router.patch("/{request_id}/tasks/{task_id}/assignee", response_model=RequestTaskResponse)
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


@router.delete("/{request_id}/tasks/{task_id}", response_model=RequestTaskResponse)
async def cancel_request_task(
    request_id: int,
    task_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> RequestTaskResponse:
    return await request_task_service.delete_task(session, request_id, task_id, user)


@router.post("/{request_id}/analysis", response_model=AIRequestAnalysisResponse)
async def generate_request_analysis(
    request_id: int,
    session: DbSession,
    _user: CurrentUser,
) -> AIRequestAnalysisResponse:
    try:
        result = await request_analysis_service.generate_analysis(session, request_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except request_analysis_service.AnalysisGenerationFailed as exc:
        _route_log.warning("Request analysis failed for %s: %s", request_id, exc.message)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )
    return AIRequestAnalysisResponse.model_validate(result)


@router.post("/{request_id}/summary", response_model=AISummaryResponse)
async def generate_summary(
    request_id: int,
    session: DbSession,
    _user: CurrentUser,
) -> AISummaryResponse:
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


@router.post("/{request_id}/assign", response_model=RequestResponse)
async def assign_request_performer(
    request_id: int,
    payload: AssignRequestPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    req = await performer_selection_service.assign_performer(
        session, request_id, payload, user
    )
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return request_service.map_request_to_response(
        req, include_stages=True, execution_events_rows=events
    )


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
    req = await request_execution_service.add_stage(session, request_id, payload, user)
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return request_service.map_request_to_response(
        req, include_stages=True, execution_events_rows=events
    )


@router.patch("/{request_id}/stages/{stage_id}", response_model=RequestResponse)
async def patch_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    payload: PatchRequestStagePayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    req = await request_execution_service.patch_stage(session, request_id, stage_id, payload, user)
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return request_service.map_request_to_response(
        req, include_stages=True, execution_events_rows=events
    )


@router.post("/{request_id}/stages/{stage_id}/assign", response_model=RequestResponse)
async def assign_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    payload: AssignRequestPayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    req = await request_execution_service.assign_stage(session, request_id, stage_id, payload, user)
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return request_service.map_request_to_response(
        req, include_stages=True, execution_events_rows=events
    )


@router.post("/{request_id}/stages/{stage_id}/complete", response_model=RequestResponse)
async def complete_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
    payload: CompleteStagePayload | None = None,
) -> RequestResponse:
    req = await request_execution_service.complete_stage(
        session, request_id, stage_id, payload, user
    )
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return request_service.map_request_to_response(
        req, include_stages=True, execution_events_rows=events
    )


@router.post("/{request_id}/stages/{stage_id}/block", response_model=RequestResponse)
async def block_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    payload: BlockStagePayload,
    session: DbSession,
    user: CurrentUser,
) -> RequestResponse:
    req = await request_execution_service.block_stage(session, request_id, stage_id, payload, user)
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return request_service.map_request_to_response(
        req, include_stages=True, execution_events_rows=events
    )


@router.post("/{request_id}/stages/{stage_id}/unblock", response_model=RequestResponse)
async def unblock_request_stage(
    request_id: int,
    stage_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
    payload: UnblockStagePayload | None = None,
) -> RequestResponse:
    req = await request_execution_service.unblock_stage(session, request_id, stage_id, payload, user)
    events = await request_stage_repository.list_execution_events(session, request_id, limit=50)
    return request_service.map_request_to_response(
        req, include_stages=True, execution_events_rows=events
    )
