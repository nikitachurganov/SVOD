from __future__ import annotations

import uuid
from urllib.parse import urlparse

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.request_stage_artifact import RequestStageArtifact
from app.models.request_execution_event import RequestExecutionEvent
from app.models.user import User
from app.repositories import request_stage_repository
from app.schemas.request_execution import AddStageLinkPayload, RequestStageArtifactResponse
from app.services import request_permissions as perms
from app.services import storage_service
from app.constants import request_execution as C


def artifact_to_response(row: RequestStageArtifact, *, download_url: str | None = None) -> RequestStageArtifactResponse:
    return RequestStageArtifactResponse(
        id=str(row.id),
        kind=row.kind,
        purpose=row.purpose,
        name=row.name,
        url=download_url if row.kind == "file" else row.url,
        content_type=row.content_type,
        size=row.size,
        created_by_user_id=str(row.created_by_user_id) if row.created_by_user_id else None,
        created_at=row.created_at.isoformat(),
    )


async def _load_context(
    session: AsyncSession, request_id: int, stage_id: uuid.UUID, user: User, *, purpose: str
):
    request, member = await perms.load_request_with_access(session, request_id, user)
    stage = await request_stage_repository.get_stage(session, stage_id)
    if stage is None or stage.request_id != request_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    active = next(
        (
            row
            for row in sorted(request.stages, key=lambda item: item.sequence)
            if row.status not in ("done", "cancelled")
        ),
        None,
    )
    can_manage_inputs = purpose == "input" and perms.can_manage_plan(request, user, member)
    if not can_manage_inputs and not perms.can_act_on_stage(request, stage, user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if can_manage_inputs:
        if stage.status in ("done", "cancelled"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed stage is immutable")
        return request, stage
    if request.workflow_status != "in_progress" or active is None or active.id != stage.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Results can only be added to the active stage")
    if stage.status in ("done", "cancelled"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed stage is immutable")
    return request, stage


async def upload_file(
    session: AsyncSession,
    request_id: int,
    stage_id: uuid.UUID,
    file: UploadFile,
    user: User,
    purpose: str = "input",
) -> RequestStageArtifactResponse:
    if purpose not in ("input", "result"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid artifact purpose")
    request, stage = await _load_context(session, request_id, stage_id, user, purpose=purpose)
    content = await file.read(settings.MAX_UPLOAD_SIZE_BYTES + 1)
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="File is empty")
    if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File is too large")
    object_key = storage_service.build_object_key(request_id, stage_id, file.filename or "file")
    await storage_service.upload_bytes(object_key, content, file.content_type)
    row = RequestStageArtifact(
        request_id=request.id,
        stage_id=stage.id,
        kind="file",
        purpose=purpose,
        name=(file.filename or "file")[:500],
        object_key=object_key,
        content_type=file.content_type,
        size=len(content),
        created_by_user_id=user.id,
    )
    session.add(row)
    session.add(RequestExecutionEvent(
        request_id=request.id, stage_id=stage.id, event_type="artifact_added", actor_user_id=user.id,
        payload={"name": row.name, "kind": row.kind, "purpose": purpose},
    ))
    await session.commit()
    await session.refresh(row)
    return artifact_to_response(row)


async def add_link(
    session: AsyncSession,
    request_id: int,
    stage_id: uuid.UUID,
    payload: AddStageLinkPayload,
    user: User,
) -> RequestStageArtifactResponse:
    request, stage = await _load_context(session, request_id, stage_id, user, purpose=payload.purpose)
    parsed = urlparse(payload.url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Only HTTP(S) links are allowed")
    row = RequestStageArtifact(
        request_id=request.id,
        stage_id=stage.id,
        kind="link",
        purpose=payload.purpose,
        name=payload.name,
        url=payload.url,
        created_by_user_id=user.id,
    )
    session.add(row)
    session.add(RequestExecutionEvent(
        request_id=request.id, stage_id=stage.id, event_type="artifact_added", actor_user_id=user.id,
        payload={"name": row.name, "kind": row.kind, "purpose": payload.purpose},
    ))
    await session.commit()
    await session.refresh(row)
    return artifact_to_response(row)


async def _get_artifact(
    session: AsyncSession, request_id: int, stage_id: uuid.UUID, artifact_id: uuid.UUID
) -> RequestStageArtifact:
    row = await session.scalar(
        select(RequestStageArtifact).where(
            RequestStageArtifact.id == artifact_id,
            RequestStageArtifact.request_id == request_id,
            RequestStageArtifact.stage_id == stage_id,
        )
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")
    return row


async def get_download_url(
    session: AsyncSession,
    request_id: int,
    stage_id: uuid.UUID,
    artifact_id: uuid.UUID,
    user: User,
) -> str:
    await perms.load_request_with_access(session, request_id, user)
    row = await _get_artifact(session, request_id, stage_id, artifact_id)
    if row.kind != "file" or not row.object_key:
        if row.url:
            return row.url
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File object not found")
    return await storage_service.create_download_url(row.object_key)


async def delete_artifact(
    session: AsyncSession,
    request_id: int,
    stage_id: uuid.UUID,
    artifact_id: uuid.UUID,
    user: User,
) -> None:
    row = await _get_artifact(session, request_id, stage_id, artifact_id)
    request, _stage = await _load_context(session, request_id, stage_id, user, purpose=row.purpose)
    if row.object_key:
        await storage_service.delete_object(row.object_key)
    await session.delete(row)
    session.add(RequestExecutionEvent(
        request_id=request.id, stage_id=stage_id, event_type="artifact_removed", actor_user_id=user.id,
        payload={"name": row.name, "purpose": row.purpose},
    ))
    await session.commit()
