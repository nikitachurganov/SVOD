import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.constants import request_workflow as W
from app.models.form_file import FormFile
from app.models.user import User
from app.repositories import file_repository, request_repository
from app.schemas.form_file import CreateFormFileRequest, FormFileResponse
from app.services import request_permissions as perms
from app.services import storage_service


def _to_response(f: FormFile) -> FormFileResponse:
    file_url = f.file_url
    if file_url.startswith("s3://"):
        file_url = f"/files/{f.id}/download-url"
    return FormFileResponse(
        id=str(f.id),
        request_id=f.request_id,
        field_id=f.field_id,
        file_name=f.file_name,
        file_type=f.file_type,
        file_size=f.file_size,
        file_url=file_url,
        created_at=f.created_at.isoformat(),
    )


async def list_files_for_request(
    session: AsyncSession, request_id: int, user: User
) -> list[FormFileResponse]:
    await perms.load_request_with_access(session, request_id, user, require_org=False)

    files = await file_repository.get_by_request_id(session, request_id)
    return [_to_response(f) for f in files]


async def create_file_metadata(
    session: AsyncSession, request_id: int, payload: CreateFormFileRequest, user: User
) -> FormFileResponse:
    await _load_editable_request(session, request_id, user)

    file = FormFile(
        request_id=request_id,
        field_id=payload.field_id,
        file_name=payload.file_name,
        file_type=payload.file_type,
        file_size=payload.file_size,
        file_url=payload.file_url,
    )
    file = await file_repository.create(session, file)
    await session.commit()
    return _to_response(file)


async def _load_editable_request(session: AsyncSession, request_id: int, user: User):
    request, member = await perms.load_request_with_access(
        session, request_id, user, require_org=False
    )
    author_can_upload = request.created_by_user_id == user.id and request.workflow_status in (
        W.WF_DRAFT,
        W.WF_NEW,
        W.WF_PLANNING,
    )
    if not author_can_upload and not perms.can_manage_request(request, user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if request.workflow_status in (W.WF_CLOSED, W.WF_CANCELLED, W.WF_ARCHIVED):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request files are immutable")
    return request


async def upload_file(
    session: AsyncSession,
    request_id: int,
    field_id: str,
    upload: UploadFile,
    user: User,
) -> FormFileResponse:
    await _load_editable_request(session, request_id, user)
    content = await upload.read(settings.MAX_UPLOAD_SIZE_BYTES + 1)
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="File is empty")
    if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File is too large")
    object_key = storage_service.build_form_object_key(
        request_id, field_id, upload.filename or "file"
    )
    await storage_service.upload_bytes(object_key, content, upload.content_type)
    row = FormFile(
        request_id=request_id,
        field_id=field_id,
        file_name=upload.filename or "file",
        file_type=upload.content_type or "application/octet-stream",
        file_size=len(content),
        file_url=f"s3://{settings.S3_BUCKET}/{object_key}",
    )
    row = await file_repository.create(session, row)
    await session.commit()
    return _to_response(row)


def _object_key(row: FormFile) -> str | None:
    return storage_service.key_from_url(row.file_url)


async def get_download_url(
    session: AsyncSession, file_id: str, user: User
) -> str:
    try:
        parsed_id = uuid.UUID(file_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found") from exc
    row = await file_repository.get_by_id(session, parsed_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await perms.load_request_with_access(session, row.request_id, user, require_org=False)
    object_key = _object_key(row)
    if object_key is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Legacy attachment has no stored binary",
        )
    return await storage_service.create_download_url(object_key)


async def delete_file(session: AsyncSession, file_id: str, user: User) -> None:
    try:
        parsed_id = uuid.UUID(file_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found") from exc
    row = await file_repository.get_by_id(session, parsed_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await _load_editable_request(session, row.request_id, user)
    object_key = _object_key(row)
    if object_key is not None:
        await storage_service.delete_object(object_key)
    deleted = await file_repository.remove(session, parsed_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await session.commit()
