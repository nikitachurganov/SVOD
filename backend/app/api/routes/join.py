"""Public "join organization" link: /join/{token}."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.join_request import (
    JoinApplyRequest,
    JoinPageInfo,
    JoinRegisterRequest,
    JoinRegisterResponse,
    JoinRequestResponse,
)
from app.services import join_request_service

router = APIRouter()


@router.get("/{token}", response_model=JoinPageInfo)
async def get_join_page(token: str, session: DbSession) -> JoinPageInfo:
    """Public: which organization the link leads to."""
    return await join_request_service.get_join_page(session, token)


@router.post("/{token}/register", response_model=JoinRegisterResponse, status_code=201)
async def register_and_apply(
    token: str, payload: JoinRegisterRequest, session: DbSession
) -> JoinRegisterResponse:
    """Public: sign up and apply in one step; returns an access token."""
    return await join_request_service.register_and_apply(session, token, payload)


@router.post("/{token}/apply", response_model=JoinRequestResponse, status_code=201)
async def apply(
    token: str, payload: JoinApplyRequest, session: DbSession, user: CurrentUser
) -> JoinRequestResponse:
    """Signed-in user applies to join."""
    return await join_request_service.apply(session, token, payload, user)
