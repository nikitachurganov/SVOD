from fastapi import APIRouter, HTTPException, Request, status

from app.api.deps import DbSession
from app.schemas.public_link import (
    PublicPageDataResponse,
    PublicRequestCreatedResponse,
    PublicRequestSubmission,
    PublicSuggestFormsRequest,
    PublicSuggestFormsResponse,
)
from app.services import public_form_suggest_service, public_link_service
from app.services.public_suggest_rate_limit import check_public_suggest_limit

router = APIRouter()


@router.get("/{token}", response_model=PublicPageDataResponse)
async def get_public_request_page(
    token: str,
    session: DbSession,
) -> PublicPageDataResponse:
    return await public_link_service.get_public_page_data(session, token)


@router.post("/{token}/suggest-forms", response_model=PublicSuggestFormsResponse)
async def suggest_public_forms(
    token: str,
    payload: PublicSuggestFormsRequest,
    session: DbSession,
    request: Request,
) -> PublicSuggestFormsResponse:
    ip = request.client.host if request.client else "unknown"
    if not check_public_suggest_limit(f"suggest:{token}:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов. Подождите минуту и попробуйте снова.",
        )
    return await public_form_suggest_service.suggest_forms_for_public_token(
        session, token, payload.text
    )


@router.post("/{token}", response_model=PublicRequestCreatedResponse, status_code=201)
async def submit_public_request(
    token: str,
    payload: PublicRequestSubmission,
    session: DbSession,
) -> PublicRequestCreatedResponse:
    return await public_link_service.submit_public_request(session, token, payload)
