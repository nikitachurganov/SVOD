from typing import Any

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: str
    organization_id: str | None = None
    request_id: str | None = None
    stage_id: str | None = None
    type: str
    title: str
    body: str | None = None
    payload: dict[str, Any] | None = None
    read_at: str | None = None
    created_at: str


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int

