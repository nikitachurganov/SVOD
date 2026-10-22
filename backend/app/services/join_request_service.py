"""Joining an organization by its reusable link, with moderation by the owner."""

from __future__ import annotations

import html
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.name_utils import build_display_name
from app.core.security import create_access_token, is_pending_activation
from app.models.organization import (
    Organization,
    OrganizationJoinRequest,
    OrganizationMember,
)
from app.models.user import User
from app.repositories import organization_repository, user_repository
from app.schemas.join_request import (
    ApproveJoinRequest,
    InviteeLookupResponse,
    JoinApplyRequest,
    JoinLinkResponse,
    JoinPageInfo,
    JoinRegisterRequest,
    JoinRegisterResponse,
    JoinRequestResponse,
    RejectJoinRequest,
)
from app.schemas.organization import MemberResponse
from app.services import auth_service, email_service, notification_service
from app.services.organization_service import (
    _ensure_owner,
    _get_org_or_404,
    _to_author,
    _to_member_response,
)

STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
STATUS_WITHDRAWN = "withdrawn"

_LINK_INVALID = "Ссылка-приглашение недействительна или выключена владельцем организации"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def join_url(token: str) -> str:
    return f"{settings.APP_PUBLIC_URL.rstrip('/')}/join/{token}"


def _display_name(user: User | None) -> str:
    if user is None:
        return ""
    return build_display_name(last_name=user.last_name, first_name=user.first_name, middle_name=user.middle_name)


def _to_response(row: OrganizationJoinRequest, *, include_phone: bool = False) -> JoinRequestResponse:
    return JoinRequestResponse(
        id=str(row.id),
        organization_id=str(row.organization_id),
        organization_name=row.organization.name if row.organization else "",
        user=_to_author(row.user),
        phone_number=(row.user.phone_number or None) if include_phone and row.user else None,
        status=row.status,
        job_title=row.job_title,
        specialization=row.specialization,
        message=row.message,
        reject_reason=row.reject_reason,
        created_at=row.created_at.isoformat(),
        decided_at=row.decided_at.isoformat() if row.decided_at else None,
    )


def _link_response(org: Organization) -> JoinLinkResponse:
    return JoinLinkResponse(
        enabled=bool(org.join_link_enabled and org.join_token),
        token=org.join_token,
        url=join_url(org.join_token) if org.join_token else None,
    )


async def _org_by_join_token(session: AsyncSession, token: str) -> Organization:
    org = await session.scalar(select(Organization).where(Organization.join_token == token))
    if org is None or not org.join_link_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_LINK_INVALID)
    return org


async def _get_request_or_404(session: AsyncSession, request_id: uuid.UUID) -> OrganizationJoinRequest:
    row = await session.get(OrganizationJoinRequest, request_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Join request not found")
    return row


# ---------------------------------------------------------------------------
# Owner: the link
# ---------------------------------------------------------------------------

async def get_join_link(session: AsyncSession, org_id: uuid.UUID, user: User) -> JoinLinkResponse:
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, user)
    return _link_response(org)


async def set_join_link_enabled(
    session: AsyncSession, org_id: uuid.UUID, enabled: bool, user: User
) -> JoinLinkResponse:
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, user)
    if enabled and not org.join_token:
        org.join_token = secrets.token_urlsafe(32)
    org.join_link_enabled = enabled
    await session.commit()
    return _link_response(org)


async def regenerate_join_link(session: AsyncSession, org_id: uuid.UUID, user: User) -> JoinLinkResponse:
    """Issue a new token: the previous link stops working immediately."""
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, user)
    org.join_token = secrets.token_urlsafe(32)
    org.join_link_enabled = True
    await session.commit()
    return _link_response(org)


# ---------------------------------------------------------------------------
# Public page + applying
# ---------------------------------------------------------------------------

async def get_join_page(session: AsyncSession, token: str) -> JoinPageInfo:
    org = await _org_by_join_token(session, token)
    return JoinPageInfo(
        organization_id=str(org.id),
        organization_name=org.name,
        organization_description=org.description,
        members_count=await organization_repository.count_members(session, org.id),
    )


async def _create_request(
    session: AsyncSession,
    org: Organization,
    user: User,
    *,
    job_title: str | None,
    specialization: str | None,
    message: str | None,
) -> OrganizationJoinRequest:
    if await organization_repository.get_member(session, org.id, user.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Вы уже состоите в этой организации")
    existing = await session.scalar(
        select(OrganizationJoinRequest).where(
            OrganizationJoinRequest.organization_id == org.id,
            OrganizationJoinRequest.user_id == user.id,
            OrganizationJoinRequest.status == STATUS_PENDING,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Заявка уже отправлена и ждёт решения владельца")

    row = OrganizationJoinRequest(
        organization_id=org.id,
        user_id=user.id,
        status=STATUS_PENDING,
        job_title=job_title,
        specialization=specialization,
        message=message,
    )
    session.add(row)
    try:
        await session.flush()
    except IntegrityError as exc:  # concurrent double submit hits the partial unique index
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Заявка уже отправлена и ждёт решения владельца"
        ) from exc

    await notification_service.create_notification(
        session,
        recipient_user_id=org.owner_user_id,
        notification_type="join_request",
        title=f"Заявка на вступление в «{org.name}»",
        body=_display_name(user) + (f" — {job_title}" if job_title else ""),
        organization_id=org.id,
        payload={"join_request_id": str(row.id)},
    )
    await session.refresh(row, attribute_names=["organization", "user"])
    return row


async def apply(
    session: AsyncSession, token: str, payload: JoinApplyRequest, user: User
) -> JoinRequestResponse:
    org = await _org_by_join_token(session, token)
    row = await _create_request(
        session,
        org,
        user,
        job_title=payload.job_title,
        specialization=payload.specialization,
        message=payload.message,
    )
    await session.commit()
    return _to_response(row)


async def register_and_apply(
    session: AsyncSession, token: str, payload: JoinRegisterRequest
) -> JoinRegisterResponse:
    """Sign up on the join page: the account works right away, membership waits for the owner."""
    org = await _org_by_join_token(session, token)
    user = await auth_service.create_account(session, payload)
    row = await _create_request(
        session,
        org,
        user,
        job_title=payload.job_title,
        specialization=payload.specialization,
        message=payload.message,
    )
    await session.commit()
    return JoinRegisterResponse(
        access_token=create_access_token(subject=str(user.id)),
        request=_to_response(row),
    )


async def list_my_requests(session: AsyncSession, user: User) -> list[JoinRequestResponse]:
    """Applicant's own requests — the latest per organization, newest first."""
    rows = (
        await session.scalars(
            select(OrganizationJoinRequest)
            .where(OrganizationJoinRequest.user_id == user.id)
            .order_by(OrganizationJoinRequest.created_at.desc())
        )
    ).all()
    latest: dict[uuid.UUID, OrganizationJoinRequest] = {}
    for row in rows:
        latest.setdefault(row.organization_id, row)
    return [_to_response(row) for row in latest.values()]


async def withdraw(session: AsyncSession, request_id: uuid.UUID, user: User) -> JoinRequestResponse:
    row = await _get_request_or_404(session, request_id)
    if row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This request is not yours")
    if row.status != STATUS_PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Заявка уже рассмотрена")
    row.status = STATUS_WITHDRAWN
    row.decided_at = datetime.now(timezone.utc)
    await session.commit()
    return _to_response(row)


# ---------------------------------------------------------------------------
# Owner: moderation
# ---------------------------------------------------------------------------

async def list_requests(
    session: AsyncSession, org_id: uuid.UUID, user: User, *, status_filter: str | None = STATUS_PENDING
) -> list[JoinRequestResponse]:
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, user)
    stmt = select(OrganizationJoinRequest).where(OrganizationJoinRequest.organization_id == org_id)
    if status_filter:
        stmt = stmt.where(OrganizationJoinRequest.status == status_filter)
    rows = (await session.scalars(stmt.order_by(OrganizationJoinRequest.created_at.desc()))).all()
    return [_to_response(row, include_phone=True) for row in rows]


async def _load_pending_for_owner(
    session: AsyncSession, request_id: uuid.UUID, user: User
) -> tuple[OrganizationJoinRequest, Organization]:
    row = await _get_request_or_404(session, request_id)
    org = await _get_org_or_404(session, row.organization_id)
    _ensure_owner(org, user)
    if row.status != STATUS_PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Заявка уже рассмотрена или отозвана")
    return row, org


async def _notify_applicant(
    session: AsyncSession,
    row: OrganizationJoinRequest,
    org: Organization,
    *,
    approved: bool,
) -> None:
    if approved:
        title = f"Вас приняли в «{org.name}»"
        body = "Организация теперь доступна в сервисе."
    else:
        title = f"Заявка в «{org.name}» отклонена"
        body = row.reject_reason or "Владелец организации отклонил заявку."
    await notification_service.create_notification(
        session,
        recipient_user_id=row.user_id,
        notification_type="join_request_approved" if approved else "join_request_rejected",
        title=title,
        body=body,
        organization_id=org.id,
        payload={"join_request_id": str(row.id)},
    )


async def _email_applicant(row: OrganizationJoinRequest, org: Organization, *, approved: bool) -> None:
    if row.user is None:
        return
    app_url = settings.APP_PUBLIC_URL.rstrip("/")
    safe_org = html.escape(org.name)
    if approved:
        subject = f"Вас приняли в «{org.name}» — СВОД"
        text = f"Владелец организации «{org.name}» одобрил вашу заявку. Войдите в СВОД: {app_url}"
        html_body = f"<p>Владелец организации «{safe_org}» одобрил вашу заявку.</p><p><a href=\"{html.escape(app_url, quote=True)}\">Открыть СВОД</a></p>"
    else:
        reason = row.reject_reason or "причина не указана"
        subject = f"Заявка в «{org.name}» отклонена — СВОД"
        text = f"Владелец организации «{org.name}» отклонил вашу заявку: {reason}"
        html_body = f"<p>Владелец организации «{safe_org}» отклонил вашу заявку.</p><p>Причина: {html.escape(reason)}</p>"
    await email_service.send_email(to=row.user.email, subject=subject, text=text, html_body=html_body)


async def approve(
    session: AsyncSession, request_id: uuid.UUID, payload: ApproveJoinRequest, user: User
) -> MemberResponse:
    row, org = await _load_pending_for_owner(session, request_id, user)
    fields = payload.model_fields_set
    job_title = payload.job_title if "job_title" in fields else row.job_title
    specialization = payload.specialization if "specialization" in fields else row.specialization

    member = await organization_repository.get_member(session, org.id, row.user_id)
    if member is None:
        member = await organization_repository.add_member(
            session,
            OrganizationMember(
                organization_id=org.id,
                user_id=row.user_id,
                role_tag="member",
                job_title=job_title,
                specialization=specialization,
            ),
        )
    row.status = STATUS_APPROVED
    row.job_title = job_title
    row.specialization = specialization
    row.decided_by_user_id = user.id
    row.decided_at = datetime.now(timezone.utc)
    await _notify_applicant(session, row, org, approved=True)
    await session.commit()
    await _email_applicant(row, org, approved=True)
    member = await organization_repository.get_member(session, org.id, row.user_id)
    assert member is not None
    return _to_member_response(member)


async def reject(
    session: AsyncSession, request_id: uuid.UUID, payload: RejectJoinRequest, user: User
) -> JoinRequestResponse:
    row, org = await _load_pending_for_owner(session, request_id, user)
    row.status = STATUS_REJECTED
    row.reject_reason = payload.reason
    row.decided_by_user_id = user.id
    row.decided_at = datetime.now(timezone.utc)
    await _notify_applicant(session, row, org, approved=False)
    await session.commit()
    await _email_applicant(row, org, approved=False)
    return _to_response(row, include_phone=True)


# ---------------------------------------------------------------------------
# Owner: manual-add form helper
# ---------------------------------------------------------------------------

async def lookup_invitee(
    session: AsyncSession, org_id: uuid.UUID, email: str, user: User
) -> InviteeLookupResponse:
    """Is there already an account with this email? Owner-only (reveals registration)."""
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, user)
    found = await user_repository.get_by_email(session, email.strip())
    if found is None or is_pending_activation(found.password_hash):
        # A never-activated account is re-invited as a new one: the form still asks for the name
        has_pending = False
        if found is not None:
            has_pending = await organization_repository.get_pending_invitation_for_user(
                session, org_id, found.id
            ) is not None
        return InviteeLookupResponse(exists=False, has_pending_invitation=has_pending)
    return InviteeLookupResponse(
        exists=True,
        full_name=_display_name(found),
        is_member=await organization_repository.get_member(session, org_id, found.id) is not None,
        has_pending_invitation=await organization_repository.get_pending_invitation_for_user(
            session, org_id, found.id
        )
        is not None,
    )

