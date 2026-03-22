import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.request import Request
from app.models.user import User
from app.repositories import request_repository
from app.schemas.request import (
    CreateRequestPayload,
    RequestResponse,
    UpdateRequestPayload,
)
from app.schemas.user import PublicAuthorResponse


def _to_author(author: User | None) -> PublicAuthorResponse | None:
    if author is None:
        return None
    return PublicAuthorResponse(
        id=str(author.id),
        first_name=author.first_name,
        last_name=author.last_name,
        middle_name=author.middle_name,
        email=author.email,
    )


def _to_response(req: Request) -> RequestResponse:
    return RequestResponse(
        id=str(req.id),
        title=req.title,
        form_id=str(req.form_id),
        organization_id=str(req.organization_id) if req.organization_id else None,
        data=req.data,
        status=req.status,
        closedAt=req.closed_at.isoformat() if req.closed_at else None,
        created_by_user_id=str(req.created_by_user_id) if req.created_by_user_id else None,
        author=_to_author(req.author),
        created_at=req.created_at.isoformat(),
        updated_at=req.updated_at.isoformat(),
        form_snapshot=req.form_snapshot,
    )


async def list_requests(
    session: AsyncSession, organization_id: uuid.UUID | None = None
) -> list[RequestResponse]:
    if organization_id is not None:
        requests = await request_repository.get_all_by_org(session, organization_id)
    else:
        requests = await request_repository.get_all(session)
    return [_to_response(r) for r in requests]


async def get_request(session: AsyncSession, request_id: int) -> RequestResponse:
    req = await request_repository.get_by_id(session, request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return _to_response(req)


async def create_request(
    session: AsyncSession, payload: CreateRequestPayload, current_user: User
) -> RequestResponse:
    org_id = uuid.UUID(payload.organization_id) if payload.organization_id else None
    req = Request(
        title=payload.title,
        form_id=uuid.UUID(payload.form_id),
        created_by_user_id=current_user.id,
        organization_id=org_id,
        data=payload.data,
        status=payload.status,
        form_snapshot=payload.form_snapshot,
    )
    req = await request_repository.create(session, req)
    await session.commit()
    return _to_response(req)


async def update_request(
    session: AsyncSession, request_id: int, payload: UpdateRequestPayload
) -> RequestResponse:
    req = await request_repository.get_by_id(session, request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    if payload.title is not None:
        req.title = payload.title
    if payload.data is not None:
        req.data = payload.data
    if payload.status is not None:
        req.status = payload.status
    if payload.closedAt is not None:
        req.closed_at = datetime.fromisoformat(payload.closedAt)
    req.updated_at = datetime.now(timezone.utc)

    req = await request_repository.update(session, req)
    await session.commit()
    return _to_response(req)


async def patch_status(
    session: AsyncSession, request_id: int, new_status: str
) -> RequestResponse:
    req = await request_repository.get_by_id(session, request_id)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    req.status = new_status
    if new_status == "closed":
        req.closed_at = datetime.now(timezone.utc)
    req.updated_at = datetime.now(timezone.utc)

    req = await request_repository.update(session, req)
    await session.commit()
    return _to_response(req)


async def delete_request(session: AsyncSession, request_id: int) -> None:
    deleted = await request_repository.remove(session, request_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    await session.commit()
