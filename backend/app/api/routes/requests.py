import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import CurrentUser, DbSession, get_current_user
from app.models.user import User
from app.schemas.request import (
    AISummaryResponse,
    CreateRequestPayload,
    PatchStatusPayload,
    RequestResponse,
    UpdateRequestPayload,
)
from app.services import request_service, request_summary_service

router = APIRouter()


@router.get("", response_model=list[RequestResponse])
async def list_requests(
    session: DbSession,
    _user: CurrentUser,
    organization_id: uuid.UUID | None = Query(default=None),
) -> list[RequestResponse]:
    return await request_service.list_requests(session, organization_id=organization_id)


@router.get("/{request_id}", response_model=RequestResponse)
async def get_request(
    request_id: int, session: DbSession, _user: CurrentUser
) -> RequestResponse:
    return await request_service.get_request(session, request_id)


@router.post("", response_model=RequestResponse, status_code=201)
async def create_request(
    payload: CreateRequestPayload, session: DbSession, user: CurrentUser
) -> RequestResponse:
    return await request_service.create_request(session, payload, user)


@router.put("/{request_id}", response_model=RequestResponse)
async def update_request(
    request_id: int,
    payload: UpdateRequestPayload,
    session: DbSession,
    _user: CurrentUser,
) -> RequestResponse:
    return await request_service.update_request(session, request_id, payload)


@router.patch("/{request_id}/status", response_model=RequestResponse)
async def patch_status(
    request_id: int,
    payload: PatchStatusPayload,
    session: DbSession,
    _user: CurrentUser,
) -> RequestResponse:
    return await request_service.patch_status(session, request_id, payload.status)


@router.post("/{request_id}/summary", response_model=AISummaryResponse)
async def generate_summary(
    request_id: int,
    session: DbSession,
    _user: User = Depends(get_current_user),
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
    _user: User = Depends(get_current_user),
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
    request_id: int, session: DbSession, _user: CurrentUser
) -> None:
    await request_service.delete_request(session, request_id)
