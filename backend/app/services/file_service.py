import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.form_file import FormFile
from app.models.user import User
from app.repositories import file_repository
from app.schemas.form_file import CreateFormFileRequest, FormFileResponse
from app.services import request_permissions as perms


def _to_response(f: FormFile) -> FormFileResponse:
    return FormFileResponse(
        id=str(f.id),
        request_id=f.request_id,
        field_id=f.field_id,
        file_name=f.file_name,
        file_type=f.file_type,
        file_size=f.file_size,
        file_url=f.file_url,
        created_at=f.created_at.isoformat(),
    )


async def list_files_for_request(
    session: AsyncSession, request_id: int, current_user: User
) -> list[FormFileResponse]:
    req, member = await perms.load_request_with_access(
        session, request_id, current_user, require_org=False
    )
    if not perms.can_view_request(req, current_user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    files = await file_repository.get_by_request_id(session, request_id)
    return [_to_response(f) for f in files]


async def create_file_metadata(
    session: AsyncSession,
    request_id: int,
    payload: CreateFormFileRequest,
    current_user: User,
) -> FormFileResponse:
    req, member = await perms.load_request_with_access(
        session, request_id, current_user, require_org=False
    )
    if not perms.can_view_request(req, current_user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

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


async def delete_file(session: AsyncSession, file_id: str, current_user: User) -> None:
    # TODO: When a file storage backend is connected, delete the actual
    # file object here before removing the metadata row.
    file_uuid = uuid.UUID(file_id)
    file = await file_repository.get_by_id(session, file_uuid)
    if file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    req, member = await perms.load_request_with_access(
        session, file.request_id, current_user, require_org=False
    )
    if not perms.can_view_request(req, current_user, member):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    deleted = await file_repository.remove(session, file_uuid)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await session.commit()
