"""Read model for the detailed, auditable stage timeline."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_execution as C
from app.models.user import User
from app.repositories import request_stage_repository
from app.schemas.request_execution import RequestTimelineResponse, RequestTimelineStageResponse
from app.services import request_permissions as perms
from app.services.request_execution_service import event_to_response, stage_to_response
from app.services.stage_artifact_service import artifact_to_response
from app.services.stage_specification_service import handoff_to_response, specification_to_response


_EVENT_TEMPLATES = {
    C.EVENT_STAGE_ADDED: "создал(а) этап",
    C.EVENT_STAGE_UPDATED: "изменил(а) параметры этапа",
    C.EVENT_ASSIGN: "передал(а) этап исполнителю",
    C.EVENT_REASSIGN: "переназначил(а) исполнителя",
    C.EVENT_START: "запустил(а) этап",
    C.EVENT_BLOCK: "заблокировал(а) этап",
    C.EVENT_UNBLOCK: "разблокировал(а) этап",
    C.EVENT_COMPLETE: "завершил(а) этап",
    C.EVENT_STAGE_SPEC_GENERATED: "подготовил(а) версию ТЗ",
    C.EVENT_STAGE_SPEC_CONFIRMED: "подтвердил(а) версию ТЗ",
    C.EVENT_ARTIFACT_ADDED: "добавил(а) материал",
    C.EVENT_ARTIFACT_REMOVED: "удалил(а) материал",
}


def _event_message(event) -> str:
    payload = event.payload or {}
    if event.event_type in (C.EVENT_ASSIGN, C.EVENT_REASSIGN):
        performer = payload.get("performer_name") or payload.get("performer_id")
        return f"{_EVENT_TEMPLATES[event.event_type]}: {performer}" if performer else _EVENT_TEMPLATES[event.event_type]
    if event.event_type == C.EVENT_ARTIFACT_ADDED:
        return f"добавил(а) {('результат' if payload.get('purpose') == 'result' else 'материал')}: {payload.get('name', '')}".strip()
    return _EVENT_TEMPLATES.get(event.event_type, event.event_type.replace("_", " "))


async def get_timeline(
    session: AsyncSession, request_id: int, user: User, *, limit: int = 200
) -> RequestTimelineResponse:
    request, _member = await perms.load_request_with_access(session, request_id, user, require_org=False)
    stages = await request_stage_repository.list_stages_for_request(session, request.id)
    events = await request_stage_repository.list_execution_events(session, request.id, limit=limit + 1)
    has_more = len(events) > limit
    events = events[:limit]
    event_responses = []
    for event in events:
        item = event_to_response(event)
        item.message = _event_message(event)
        event_responses.append(item)
    timeline_stages: list[RequestTimelineStageResponse] = []
    for stage in stages:
        base = stage_to_response(stage).model_dump()
        stage_events = [item for item in event_responses if item.stage_id == str(stage.id)]
        artifacts = [artifact_to_response(row) for row in stage.artifacts]
        timeline_stages.append(RequestTimelineStageResponse(
            **base,
            specifications=[specification_to_response(row) for row in stage.specifications],
            handoffs=[handoff_to_response(row) for row in stage.handoffs],
            input_artifacts=[row for row in artifacts if row.purpose == "input"],
            result_artifacts=[row for row in artifacts if row.purpose == "result"],
            events=stage_events,
        ))
    return RequestTimelineResponse(
        request_id=str(request.id), stages=timeline_stages, events=event_responses,
        next_before=events[-1].created_at.isoformat() if has_more and events else None,
    )
