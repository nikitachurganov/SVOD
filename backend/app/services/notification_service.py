from __future__ import annotations

import uuid
from collections.abc import Collection
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_workflow as W
from app.models.notification import Notification
from app.models.request import Request
from app.models.request_stage import RequestStage
from app.models.user import User
from app.repositories import organization_repository
from app.schemas.notification import NotificationListResponse, NotificationResponse
from app.core.metrics import NOTIFICATION_SKIPPED, OVERDUE_STAGES


def _to_response(row: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=str(row.id),
        organization_id=str(row.organization_id) if row.organization_id else None,
        request_id=str(row.request_id) if row.request_id else None,
        stage_id=str(row.stage_id) if row.stage_id else None,
        type=row.type,
        title=row.title,
        body=row.body,
        payload=row.payload,
        read_at=row.read_at.isoformat() if row.read_at else None,
        created_at=row.created_at.isoformat(),
    )


async def create_notification(
    session: AsyncSession,
    *,
    recipient_user_id: uuid.UUID | None,
    notification_type: str,
    title: str,
    body: str | None = None,
    request: Request | None = None,
    stage: RequestStage | None = None,
    payload: dict | None = None,
    unique_key: str | None = None,
    organization_id: uuid.UUID | None = None,
) -> bool:
    if recipient_user_id is None:
        NOTIFICATION_SKIPPED.labels(notification_type).inc()
        return False
    if unique_key:
        exists = await session.scalar(select(Notification.id).where(Notification.unique_key == unique_key))
        if exists is not None:
            return False
    session.add(
        Notification(
            recipient_user_id=recipient_user_id,
            organization_id=request.organization_id if request else organization_id,
            request_id=request.id if request else None,
            stage_id=stage.id if stage else None,
            type=notification_type,
            title=title,
            body=body,
            payload=payload,
            unique_key=unique_key,
        )
    )
    return True


async def notify_stage_assignee(
    session: AsyncSession,
    request: Request,
    stage: RequestStage,
    *,
    notification_type: str,
    title: str,
    body: str | None = None,
    unique_key: str | None = None,
) -> None:
    recipient = stage.assignee_internal_user_id if stage.assignee_kind == "internal" else None
    await create_notification(
        session,
        recipient_user_id=recipient,
        notification_type=notification_type,
        title=title,
        body=body,
        request=request,
        stage=stage,
        unique_key=unique_key,
    )


async def notify_org_owners(
    session: AsyncSession,
    request: Request,
    *,
    exclude_user_ids: Collection[uuid.UUID | None],
    notification_type: str,
    title: str,
    body: str | None = None,
) -> None:
    if request.organization_id is None:
        return
    for member in await organization_repository.list_members(session, request.organization_id):
        if member.role_tag in W.MANAGER_ROLE_TAGS and member.user_id not in exclude_user_ids:
            await create_notification(
                session,
                recipient_user_id=member.user_id,
                notification_type=notification_type,
                title=title,
                body=body,
                request=request,
            )


async def notify_request_author(
    session: AsyncSession,
    request: Request,
    *,
    actor_user_id: uuid.UUID | None,
    notification_type: str,
    title: str,
    body: str | None = None,
) -> None:
    """Lifecycle milestones for the author; skipped when the author did it themselves."""
    author_id = request.created_by_user_id
    if author_id is None or author_id == actor_user_id:
        return
    await create_notification(
        session,
        recipient_user_id=author_id,
        notification_type=notification_type,
        title=title,
        body=body,
        request=request,
    )


async def notify_request_created(
    session: AsyncSession, request: Request, *, actor_user_id: uuid.UUID | None
) -> None:
    """Owners triage incoming requests; the author gets a confirmation."""
    if request.workflow_status == W.WF_DRAFT:
        return
    await notify_org_owners(
        session,
        request,
        exclude_user_ids={actor_user_id},
        notification_type="request_created",
        title=f"Новая заявка № {request.id}",
        body=request.title,
    )
    if request.created_by_user_id is not None:
        await create_notification(
            session,
            recipient_user_id=request.created_by_user_id,
            notification_type="request_submitted",
            title=f"Ваша заявка № {request.id} создана",
            body=request.title,
            request=request,
        )


async def list_notifications(
    session: AsyncSession, user: User, *, limit: int = 50
) -> NotificationListResponse:
    result = await session.execute(
        select(Notification)
        .where(Notification.recipient_user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(min(max(limit, 1), 100))
    )
    rows = list(result.scalars().all())
    unread = await session.scalar(
        select(func.count(Notification.id)).where(
            Notification.recipient_user_id == user.id,
            Notification.read_at.is_(None),
        )
    )
    return NotificationListResponse(items=[_to_response(row) for row in rows], unread_count=int(unread or 0))


async def mark_read(session: AsyncSession, notification_id: uuid.UUID, user: User) -> None:
    row = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.recipient_user_id == user.id,
        )
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        await session.commit()


async def mark_all_read(session: AsyncSession, user: User) -> None:
    await session.execute(
        update(Notification)
        .where(Notification.recipient_user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    await session.commit()


async def enqueue_overdue_notifications(session: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(RequestStage, Request)
        .join(Request, Request.id == RequestStage.request_id)
        .where(
            RequestStage.due_date.is_not(None),
            RequestStage.due_date < now,
            RequestStage.status.notin_(("done", "cancelled")),
            Request.deleted.is_(False),
        )
    )
    count = 0
    overdue_stage_ids: set[uuid.UUID] = set()
    for stage, request in result.all():
        overdue_stage_ids.add(stage.id)
        recipients = {request.responsible_user_id}
        if stage.assignee_kind == "internal":
            recipients.add(stage.assignee_internal_user_id)
        for recipient in recipients:
            if recipient is None:
                continue
            created = await create_notification(
                session,
                recipient_user_id=recipient,
                notification_type="stage_overdue",
                title=f"Просрочен этап «{stage.title}»",
                body=f"Заявка № {request.id}",
                request=request,
                stage=stage,
                unique_key=f"stage-overdue:{stage.id}:{recipient}",
            )
            if created:
                count += 1
    await session.commit()
    OVERDUE_STAGES.set(len(overdue_stage_ids))
    return count
