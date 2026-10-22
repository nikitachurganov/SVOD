from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_execution as C
from app.constants import request_workflow as W
from app.models.request_ai_stage_plan import RequestAIStagePlan
from app.models.request_stage import RequestStage
from app.models.user import User
from app.repositories import request_repository
from app.schemas.request_ai import AIStagePlanItem, ApplyAIStagePlanPayload
from app.services import request_permissions as perms
from app.services.openrouter_client import post_chat_completion, strip_json_fence
from app.services.request_ai_common import build_form_answers_text


def request_fingerprint(request) -> str:
    raw = json.dumps(
        {
            "title": request.title,
            "data": request.data,
            "form_snapshot": request.form_snapshot,
            "ai_analysis": request.ai_analysis,
        },
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def generate_stage_plan(session: AsyncSession, request_id: int) -> dict:
    request = await request_repository.get_by_id(session, request_id)
    if request is None:
        raise ValueError("Request not found")
    prompt = (
        f"Заявка: {request.title}\n"
        f"Данные:\n{build_form_answers_text(request)}\n\n"
        "Составь строго последовательный план исполнения заявки. "
        "Ответь только JSON вида {\"stages\":[{\"title\":str,\"description\":str|null,"
        "\"expected_result\":str,\"role_hint\":str|null,\"estimated_duration_days\":int}]}. "
        "Нужно от 1 до 15 конкретных этапов. Ревью, тестирование и выпуск оформляй отдельными этапами, когда они уместны."
    )
    raw = await post_chat_completion(
        [
            {"role": "system", "content": "Ты проектируешь исполнимые рабочие процессы. Возвращай только валидный JSON на русском языке."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=2200,
        temperature=0.15,
    )
    try:
        parsed = json.loads(strip_json_fence(raw))
        source = parsed.get("stages") if isinstance(parsed, dict) else None
        if not isinstance(source, list):
            raise ValueError("Missing stages")
        stages = [AIStagePlanItem.model_validate(item) for item in source[:15]]
        if not stages:
            raise ValueError("Empty stage plan")
    except (json.JSONDecodeError, ValueError, ValidationError) as exc:
        raise RuntimeError("OpenRouter returned an invalid stage plan") from exc

    fingerprint = request_fingerprint(request)
    row = await session.scalar(
        select(RequestAIStagePlan).where(RequestAIStagePlan.request_id == request_id)
    )
    proposal = {"stages": [stage.model_dump() for stage in stages]}
    if row is None:
        row = RequestAIStagePlan(
            request_id=request_id,
            status="draft",
            source_fingerprint=fingerprint,
            proposal=proposal,
        )
        session.add(row)
    else:
        row.status = "draft"
        row.source_fingerprint = fingerprint
        row.proposal = proposal
        row.generated_at = datetime.now(timezone.utc)
        row.applied_at = None
    await session.commit()
    # Each proposed stage receives an independent TЗ job. They enrich the
    # editable AI draft only; no real stage, performer or launch is created.
    from app.services import ai_job_service
    for index, _stage in enumerate(proposal["stages"]):
        try:
            await ai_job_service.enqueue(
                session, request_id, ai_job_service.JOB_STAGE_PLAN_SPECIFICATION,
                force=False, payload={"plan_index": index},
            )
        except Exception:
            # A partial plan remains useful for manual editing and application.
            pass
        try:
            await ai_job_service.enqueue(
                session, request_id, ai_job_service.JOB_STAGE_PLAN_PERFORMERS,
                force=False, payload={"plan_index": index},
            )
        except Exception:
            pass
    return proposal


async def generate_plan_stage_specification(session: AsyncSession, request_id: int, plan_index: int) -> dict:
    """Generate TЗ for a *draft* plan item before an actual stage exists."""
    request = await request_repository.get_by_id(session, request_id)
    row = await session.scalar(select(RequestAIStagePlan).where(RequestAIStagePlan.request_id == request_id))
    if request is None or row is None:
        raise ValueError("AI stage plan not found")
    proposal = dict(row.proposal or {})
    stages = list(proposal.get("stages") or [])
    if plan_index < 0 or plan_index >= len(stages):
        raise ValueError("AI stage plan item not found")
    stage = AIStagePlanItem.model_validate(stages[plan_index])
    prompt = (
        f"Заявка: {request.title}\nДанные: {build_form_answers_text(request)}\n\n"
        f"Этап: {stage.title}\nОписание: {stage.description or '-'}\n"
        f"Ожидаемый результат: {stage.expected_result or '-'}\nРоль: {stage.role_hint or '-'}\n\n"
        "Составь ТЗ для этого этапа. Ответь только JSON со свойствами title, short_description, goal, tasks, "
        "expected_result, inputs, constraints, deadline, acceptance_criteria, clarifications_and_risks, missing_or_unclear."
    )
    raw = await post_chat_completion(
        [{"role": "system", "content": "Ты составляешь рабочие ТЗ. Возвращай только валидный JSON на русском."}, {"role": "user", "content": prompt}],
        max_tokens=1800, temperature=0.15,
    )
    try:
        technical_spec = json.loads(strip_json_fence(raw))
    except json.JSONDecodeError as exc:
        raise RuntimeError("OpenRouter returned an invalid draft stage specification") from exc
    if not isinstance(technical_spec, dict):
        raise RuntimeError("OpenRouter returned an invalid draft stage specification")
    stage.technical_spec = technical_spec
    stages[plan_index] = stage.model_dump()
    proposal["stages"] = stages
    row.proposal = proposal
    await session.commit()
    return {"plan_index": plan_index, "status": "ready"}


async def generate_plan_performer_recommendations(session: AsyncSession, request_id: int, plan_index: int) -> dict:
    """Score organization performers for a draft stage without assigning anyone."""
    row = await session.scalar(select(RequestAIStagePlan).where(RequestAIStagePlan.request_id == request_id))
    if row is None:
        raise ValueError("AI stage plan not found")
    proposal = dict(row.proposal or {})
    stages = list(proposal.get("stages") or [])
    if plan_index < 0 or plan_index >= len(stages):
        raise ValueError("AI stage plan item not found")
    stage = AIStagePlanItem.model_validate(stages[plan_index])
    context = "\n".join(value for value in (stage.title, stage.description, stage.expected_result, stage.role_hint) if value)
    from app.services import performer_selection_service
    recommendation = await performer_selection_service.get_recommended_performers(
        session, request_id, None, context=context
    )
    stage.recommended_performers = list(recommendation.get("performers") or [])
    stages[plan_index] = stage.model_dump()
    proposal["stages"] = stages
    row.proposal = proposal
    await session.commit()
    return {"plan_index": plan_index, "performers": len(stage.recommended_performers)}


async def apply_stage_plan(
    session: AsyncSession,
    request_id: int,
    payload: ApplyAIStagePlanPayload,
    current_user: User,
):
    request, member = await perms.load_request_with_access(session, request_id, current_user)
    if not perms.can_manage_plan(request, current_user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if request.workflow_status not in (W.WF_NEW, W.WF_PLANNING, W.WF_COMPLETED):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Stage plan can only be applied during planning")
    if any(stage.status not in (C.STAGE_PENDING, C.STAGE_CANCELLED) for stage in request.stages):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Started or completed stages cannot be replaced")

    plan = request.ai_stage_plan
    source = payload.stages
    if source is None:
        if plan is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI stage plan not found")
        source = [AIStagePlanItem.model_validate(item) for item in (plan.proposal or {}).get("stages", [])]
    if not source:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Stage plan is empty")

    for existing in list(request.stages):
        await session.delete(existing)
    await session.flush()
    request.stages.clear()
    cumulative_days = 0
    for index, item in enumerate(source, start=1):
        cumulative_days += item.estimated_duration_days or 0
        stage = RequestStage(
            request_id=request.id,
            sequence=index,
            title=item.title,
            description=item.description,
            expected_result=item.expected_result,
            recommended_role=item.role_hint,
            due_date=(
                datetime.now(timezone.utc) + timedelta(days=cumulative_days)
                if cumulative_days
                else None
            ),
            assignee_kind="unassigned",
            status=C.STAGE_PENDING,
            source=C.STAGE_SOURCE_AI,
        )
        session.add(stage)
        request.stages.append(stage)
        if item.technical_spec:
            await session.flush()
            from app.models.request_stage_specification import RequestStageSpecification
            session.add(RequestStageSpecification(
                request_id=request.id, stage_id=stage.id, version=1, status="draft",
                source="ai", sections=item.technical_spec,
            ))
    request.workflow_status = W.WF_PLANNING
    request.status = C.LEGACY_OPEN
    request.closed_at = None
    request.updated_at = datetime.now(timezone.utc)
    if plan is not None:
        plan.status = "applied"
        plan.applied_at = datetime.now(timezone.utc)
    await session.commit()
    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None
    # The plan is only a draft until a responsible user applies it. Once real
    # stage ids exist, independently queue their TЗ documents. A failed job
    # leaves the manual planning path fully available.
    from app.services import stage_specification_service
    from app.core.config import settings
    if settings.AI_JOBS_ENABLED:
        for stage in refreshed.stages:
            if stage.specifications:
                continue
            try:
                await stage_specification_service.enqueue_generation(session, request_id, stage.id, force=False)
            except Exception:
                # Creation and confirmation of a plan must never wait for AI.
                pass
    return refreshed
