import uuid

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.request import (
    CreateRequestPayload,
    PatchStatusPayload,
    RequestResponse,
    UpdateRequestPayload,
)
from app.services import request_service

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


@router.delete("/{request_id}", status_code=204)
async def delete_request(
    request_id: int, session: DbSession, _user: CurrentUser
) -> None:
    await request_service.delete_request(session, request_id)
