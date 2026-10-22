from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.telegram import (
    TelegramLinkResponse,
    TelegramRequestSourceResponse,
    TelegramStatusResponse,
)
from app.services import telegram_link_service, telegram_suggestion_service

router = APIRouter()


@router.get("/status", response_model=TelegramStatusResponse)
async def get_telegram_status(session: DbSession, user: CurrentUser) -> TelegramStatusResponse:
    return await telegram_link_service.get_status(session, user)


@router.post("/link", response_model=TelegramLinkResponse)
async def create_telegram_link(session: DbSession, user: CurrentUser) -> TelegramLinkResponse:
    return await telegram_link_service.create_link(session, user)


@router.delete("/link", status_code=204)
async def delete_telegram_link(session: DbSession, user: CurrentUser) -> Response:
    await telegram_link_service.unlink(session, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/requests/{request_id}/source", response_model=TelegramRequestSourceResponse)
async def get_request_telegram_source(
    request_id: int, session: DbSession, user: CurrentUser
) -> TelegramRequestSourceResponse:
    return await telegram_suggestion_service.get_request_source(session, request_id, user)
