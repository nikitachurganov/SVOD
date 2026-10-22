import uuid

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.notification import NotificationListResponse
from app.services import notification_service

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    session: DbSession,
    user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=100),
) -> NotificationListResponse:
    return await notification_service.list_notifications(session, user, limit=limit)


@router.patch("/{notification_id}/read", status_code=204)
async def mark_notification_read(
    notification_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> Response:
    await notification_service.mark_read(session, notification_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/read-all", status_code=204)
async def mark_all_notifications_read(session: DbSession, user: CurrentUser) -> Response:
    await notification_service.mark_all_read(session, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

