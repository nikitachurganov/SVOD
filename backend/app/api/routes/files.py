from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.form_file import CreateFormFileRequest, FormFileResponse
from app.services import file_service

router = APIRouter()


@router.get("/requests/{request_id}/files", response_model=list[FormFileResponse])
async def list_files(
    request_id: int, session: DbSession, user: CurrentUser
) -> list[FormFileResponse]:
    return await file_service.list_files_for_request(session, request_id, user)


@router.post(
    "/requests/{request_id}/files",
    response_model=FormFileResponse,
    status_code=201,
)
async def create_file(
    request_id: int,
    payload: CreateFormFileRequest,
    session: DbSession,
    user: CurrentUser,
) -> FormFileResponse:
    return await file_service.create_file_metadata(session, request_id, payload, user)


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(file_id: str, session: DbSession, user: CurrentUser) -> None:
    await file_service.delete_file(session, file_id, user)
