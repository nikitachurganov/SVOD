"""Stage-level technical specifications and immutable handoff packages."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_execution as C
from app.models.request_stage import RequestStage
from app.models.request_stage_handoff import RequestStageHandoff
from app.models.request_stage_specification import RequestStageSpecification
from app.models.user import User
from app.repositories import request_stage_repository
from app.schemas.request_execution import (
    PatchStageTechnicalSpecPayload,
    StageHandoffResponse,
    StageTechnicalSpecResponse,
)
from app.services import request_permissions as perms
from app.services.openrouter_client import post_chat_completion, strip_json_fence
from app.services.request_ai_common import build_form_answers_text


def specification_to_response(row: RequestStageSpecification) -> StageTechnicalSpecResponse:
    return StageTechnicalSpecResponse(
        id=str(row.id), version=row.version, status=row.status, source=row.source,
        sections=row.sections or {}, generated_at=row.generated_at.isoformat(),
        confirmed_at=row.confirmed_at.isoformat() if row.confirmed_at else None,
    )


def handoff_to_response(row: RequestStageHandoff) -> StageHandoffResponse:
    return StageHandoffResponse(
        id=str(row.id), specification_id=str(row.specification_id) if row.specification_id else None,
        specification_version=row.specification_version, specification_snapshot=row.specification_snapshot,
        assignee_kind=row.assignee_kind, assignee_id=str(row.assignee_id) if row.assignee_id else None,
        assignee_name=row.assignee_name, assigned_by_user_id=str(row.assigned_by_user_id) if row.assigned_by_user_id else None,
        assigned_by_name=row.assigned_by_name, due_date=row.due_date.isoformat() if row.due_date else None,
        materials_snapshot=row.materials_snapshot or [], assigned_at=row.assigned_at.isoformat(),
    )


async def _next_version(session: AsyncSession, stage_id: uuid.UUID) -> int:
    latest = await session.scalar(
        select(func.max(RequestStageSpecification.version)).where(RequestStageSpecification.stage_id == stage_id)
    )
    return int(latest or 0) + 1


async def _load_manageable_stage(session: AsyncSession, request_id: int, stage_id: uuid.UUID, user: User):
    request, member = await perms.load_request_with_access(session, request_id, user)
    if not perms.can_manage_plan(request, user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the responsible user or organization owner can manage the stage specification")
    stage = await request_stage_repository.get_stage(session, stage_id)
    if stage is None or stage.request_id != request_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    if stage.status in C.STAGE_TERMINAL:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed stage specification is immutable")
    return request, stage


async def _create_revision(
    session: AsyncSession,
    *,
    request_id: int,
    stage: RequestStage,
    sections: dict,
    source: str,
    user_id: uuid.UUID | None,
) -> RequestStageSpecification:
    row = RequestStageSpecification(
        request_id=request_id, stage_id=stage.id, version=await _next_version(session, stage.id),
        status="draft", source=source, sections=sections, generated_by_user_id=user_id,
    )
    session.add(row)
    await session.flush()
    return row


async def generate_stage_specification(session: AsyncSession, request_id: int, stage_id: uuid.UUID) -> dict:
    """Worker-only generation. A failure bubbles up to the AI job and never blocks the request."""
    from app.repositories import request_repository

    request = await request_repository.get_by_id(session, request_id)
    stage = await request_stage_repository.get_stage(session, stage_id)
    if request is None or stage is None or stage.request_id != request_id:
        raise ValueError("Request stage not found")
    prompt = (
        f"Заявка: {request.title}\nДанные формы:\n{build_form_answers_text(request)}\n\n"
        f"Этап: {stage.title}\nОписание: {stage.description or '-'}\n"
        f"Ожидаемый результат: {stage.expected_result or '-'}\nРекомендуемая роль: {stage.recommended_role or '-'}\n\n"
        "Подготовь отдельное техническое задание на этот этап. Верни только JSON со свойствами "
        "title, short_description, goal, tasks, expected_result, inputs, constraints, deadline, "
        "acceptance_criteria, clarifications_and_risks, missing_or_unclear. Массивы должны содержать строки."
    )
    raw = await post_chat_completion(
        [
            {"role": "system", "content": "Ты составляешь точные рабочие ТЗ на русском языке. Возвращай только валидный JSON."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=2200,
        temperature=0.15,
    )
    try:
        sections = json.loads(strip_json_fence(raw))
    except json.JSONDecodeError as exc:
        raise RuntimeError("OpenRouter returned an invalid stage specification") from exc
    if not isinstance(sections, dict):
        raise RuntimeError("OpenRouter returned an invalid stage specification")
    for key in ("tasks", "inputs", "constraints", "acceptance_criteria", "clarifications_and_risks", "missing_or_unclear"):
        if key in sections and not isinstance(sections[key], list):
            sections[key] = [str(sections[key])]
    sections.setdefault("title", stage.title)
    sections.setdefault("expected_result", stage.expected_result or "")
    row = await _create_revision(
        session, request_id=request_id, stage=stage, sections=sections, source="ai", user_id=None
    )
    from app.services.request_execution_service import append_event
    await append_event(
        session, request_id=request_id, stage_id=stage.id, event_type=C.EVENT_STAGE_SPEC_GENERATED,
        actor_user_id=None, payload={"version": row.version, "source": "ai"},
    )
    await session.commit()
    return {"stage_id": str(stage.id), "version": row.version, "status": row.status}


async def create_manual_specification(
    session: AsyncSession, request_id: int, stage_id: uuid.UUID, user: User
) -> StageTechnicalSpecResponse:
    _request, stage = await _load_manageable_stage(session, request_id, stage_id, user)
    row = await _create_revision(
        session, request_id=request_id, stage=stage,
        sections={"title": stage.title, "expected_result": stage.expected_result or ""},
        source="manual", user_id=user.id,
    )
    await session.commit()
    await session.refresh(row)
    return specification_to_response(row)


async def patch_specification(
    session: AsyncSession, request_id: int, stage_id: uuid.UUID, specification_id: uuid.UUID,
    payload: PatchStageTechnicalSpecPayload, user: User,
) -> StageTechnicalSpecResponse:
    _request, stage = await _load_manageable_stage(session, request_id, stage_id, user)
    row = await session.get(RequestStageSpecification, specification_id)
    if row is None or row.stage_id != stage.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage specification not found")
    if row.status == "confirmed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Confirmed specification is immutable; create a new version")
    row.sections = {**(row.sections or {}), **payload.sections}
    await session.commit()
    await session.refresh(row)
    return specification_to_response(row)


async def confirm_specification(
    session: AsyncSession, request_id: int, stage_id: uuid.UUID, specification_id: uuid.UUID, user: User,
) -> StageTechnicalSpecResponse:
    _request, stage = await _load_manageable_stage(session, request_id, stage_id, user)
    row = await session.get(RequestStageSpecification, specification_id)
    if row is None or row.stage_id != stage.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage specification not found")
    if row.status != "confirmed":
        row.status = "confirmed"
        row.confirmed_at = datetime.now(timezone.utc)
        row.confirmed_by_user_id = user.id
        from app.services.request_execution_service import append_event
        await append_event(
            session, request_id=request_id, stage_id=stage.id, event_type=C.EVENT_STAGE_SPEC_CONFIRMED,
            actor_user_id=user.id, payload={"version": row.version},
        )
        await session.commit()
        await session.refresh(row)
    return specification_to_response(row)


async def enqueue_generation(session: AsyncSession, request_id: int, stage_id: uuid.UUID, *, force: bool = True):
    from app.services import ai_job_service
    return await ai_job_service.enqueue(
        session, request_id, ai_job_service.JOB_STAGE_SPECIFICATION, force=force,
        payload={"stage_id": str(stage_id)},
    )
