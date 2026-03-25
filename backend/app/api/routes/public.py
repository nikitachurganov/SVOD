from fastapi import APIRouter

from app.api.deps import DbSession
from app.schemas.public_link import (
    PublicPageDataResponse,
    PublicRequestCreatedResponse,
    PublicRequestSubmission,
)
from app.services import public_link_service

router = APIRouter()


@router.get("/{token}", response_model=PublicPageDataResponse)
async def get_public_request_page(
    token: str,
    session: DbSession,
) -> PublicPageDataResponse:
    return await public_link_service.get_public_page_data(session, token)


@router.post("/{token}", response_model=PublicRequestCreatedResponse, status_code=201)
async def submit_public_request(
    token: str,
    payload: PublicRequestSubmission,
    session: DbSession,
) -> PublicRequestCreatedResponse:
    return await public_link_service.submit_public_request(session, token, payload)
