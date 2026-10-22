from __future__ import annotations

import hashlib
import json
import logging
import uuid
import time
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import case, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_workflow as W
from app.models.ai_job import AIJob
from app.models.request import Request
from app.models.user import User
from app.repositories import request_repository
from app.schemas.request_ai import AIJobResponse
from app.core.config import settings
from app.core.metrics import AI_JOB_DURATION, AI_JOB_RETRIES
from app.services import (
    request_analysis_service,
    request_permissions,
    request_stage_plan_service,
    request_summary_service,
    stage_specification_service,
)

logger = logging.getLogger(__name__)

JOB_ANALYSIS = "request_analysis"
JOB_STAGE_PLAN = "stage_plan"
JOB_STAGE_SPECIFICATION = "stage_specification"
JOB_REQUEST_TZ = "request_tz"
JOB_STAGE_PLAN_SPECIFICATION = "stage_plan_specification"
JOB_STAGE_PLAN_PERFORMERS = "stage_plan_performers"

# Follow-up jobs fan out per plan item; they must not delay jobs a user is waiting for.
_BACKGROUND_KINDS = (JOB_STAGE_PLAN_SPECIFICATION, JOB_STAGE_PLAN_PERFORMERS)
_INACTIVE_STATUSES = (W.WF_CLOSED, W.WF_CANCELLED, W.WF_ARCHIVED)


def fingerprint_request(request) -> str:
    raw = json.dumps(
        {"title": request.title, "data": request.data, "form_snapshot": request.form_snapshot},
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def to_response(job: AIJob) -> AIJobResponse:
    return AIJobResponse(
        id=str(job.id),
        request_id=str(job.request_id),
        kind=job.kind,
        status=job.status,
        error=job.error,
        result=job.result,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
    )


async def enqueue(
    session: AsyncSession,
    request_id: int,
    kind: str,
    *,
    force: bool = False,
    payload: dict | None = None,
) -> AIJob:
    request = await request_repository.get_by_id(session, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    fingerprint = fingerprint_request(request)
    if payload:
        payload_hash = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
        fingerprint = hashlib.sha256(f"{fingerprint}:{payload_hash}".encode()).hexdigest()
    if force:
        fingerprint = hashlib.sha256(f"{fingerprint}:{uuid.uuid4()}".encode()).hexdigest()
    else:
        existing = await session.scalar(
            select(AIJob).where(
                AIJob.request_id == request_id,
                AIJob.kind == kind,
                AIJob.fingerprint == fingerprint,
                AIJob.status.in_(("queued", "running", "succeeded")),
            )
        )
        if existing is not None:
            return existing
    job = AIJob(
        request_id=request_id,
        kind=kind,
        fingerprint=fingerprint,
        payload=payload,
        max_attempts=max(1, settings.AI_JOB_MAX_ATTEMPTS),
    )
    session.add(job)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(AIJob).where(
                AIJob.request_id == request_id,
                AIJob.kind == kind,
                AIJob.fingerprint == fingerprint,
                AIJob.status.in_(("queued", "running")),
            )
        )
        if existing is not None:
            return existing
        raise
    await session.refresh(job)
    return job


async def get_job(session: AsyncSession, job_id: uuid.UUID, user: User) -> AIJobResponse:
    job = await session.get(AIJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI job not found")
    await request_permissions.load_request_with_access(session, job.request_id, user)
    return to_response(job)


async def claim_next(session: AsyncSession) -> AIJob | None:
    now = datetime.now(timezone.utc)
    job = await session.scalar(
        select(AIJob)
        .where(AIJob.status == "queued", AIJob.available_at <= now)
        .order_by(
            case((AIJob.kind.in_(_BACKGROUND_KINDS), 1), else_=0),
            AIJob.created_at,
        )
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    if job is None:
        return None
    job.status = "running"
    job.locked_at = now
    job.attempts += 1
    await session.commit()
    return job


async def requeue_stale_jobs(session: AsyncSession) -> int:
    stale_before = datetime.now(timezone.utc) - timedelta(
        seconds=max(60, settings.AI_JOB_STALE_SECONDS)
    )
    result = await session.execute(
        update(AIJob)
        .where(AIJob.status == "running", AIJob.locked_at < stale_before)
        .values(status="queued", locked_at=None, available_at=datetime.now(timezone.utc))
    )
    await session.commit()
    return int(result.rowcount or 0)


async def process_job(session: AsyncSession, job: AIJob) -> None:
    started = time.monotonic()
    # SQLAlchemy expires ORM attributes on rollback. Keep the values needed by
    # the error path before any provider/database operation can fail.
    job_id = job.id
    job_kind = job.kind

    request = await session.get(Request, job.request_id)
    if request is None or request.deleted or request.workflow_status in _INACTIVE_STATUSES:
        job.status = "failed"
        job.error = "Request is closed, job skipped"
        job.locked_at = None
        await session.commit()
        logger.info("Skipping AI job %s (%s): request %s is inactive", job_id, job_kind, job.request_id)
        return

    try:
        if job.kind == JOB_ANALYSIS:
            summary = None
            try:
                summary = await request_summary_service.generate_summary(session, job.request_id)
            except Exception:
                # A summary is auxiliary. Quality analysis must still reach the
                # request and an unavailable LLM must not block its workflow.
                logger.exception("AI summary failed for request %s", job.request_id)
            analysis = await request_analysis_service.generate_analysis(session, job.request_id)
            result = {"summary": summary, "analysis": analysis}
        elif job.kind == JOB_STAGE_PLAN:
            result = await request_stage_plan_service.generate_stage_plan(session, job.request_id)
        elif job.kind == JOB_STAGE_SPECIFICATION:
            stage_id_raw = (job.payload or {}).get("stage_id")
            if not stage_id_raw:
                raise RuntimeError("Stage specification job is missing stage_id")
            result = await stage_specification_service.generate_stage_specification(
                session, job.request_id, uuid.UUID(str(stage_id_raw))
            )
        elif job.kind == JOB_REQUEST_TZ:
            # Request-level TZ is retired (stages carry their own specs); drain leftover jobs
            result = {"skipped": "request-level TZ generation is disabled"}
        elif job.kind == JOB_STAGE_PLAN_SPECIFICATION:
            plan_index = (job.payload or {}).get("plan_index")
            if not isinstance(plan_index, int):
                raise RuntimeError("Draft stage specification job is missing plan_index")
            result = await request_stage_plan_service.generate_plan_stage_specification(
                session, job.request_id, plan_index
            )
        elif job.kind == JOB_STAGE_PLAN_PERFORMERS:
            plan_index = (job.payload or {}).get("plan_index")
            if not isinstance(plan_index, int):
                raise RuntimeError("Draft stage performer job is missing plan_index")
            result = await request_stage_plan_service.generate_plan_performer_recommendations(
                session, job.request_id, plan_index
            )
        else:
            raise RuntimeError(f"Unknown AI job kind: {job.kind}")
        current = await session.get(AIJob, job_id)
        assert current is not None
        current.status = "succeeded"
        current.result = result
        current.error = None
        current.locked_at = None
        await session.commit()
        AI_JOB_DURATION.labels(job_kind, "succeeded").observe(time.monotonic() - started)
    except Exception as exc:
        await session.rollback()
        current = await session.get(AIJob, job_id)
        if current is None:
            return
        current.error = str(exc)[:4000]
        current.locked_at = None
        if current.attempts < current.max_attempts:
            current.status = "queued"
            current.available_at = datetime.now(timezone.utc) + timedelta(seconds=10 * current.attempts)
            AI_JOB_RETRIES.labels(current.kind).inc()
        else:
            current.status = "failed"
        await session.commit()
        AI_JOB_DURATION.labels(job_kind, "failed").observe(time.monotonic() - started)
