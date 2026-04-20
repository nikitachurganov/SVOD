import logging
import secrets
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_execution as C
from app.models.public_link import PublicRequestLink
from app.models.request import Request
from app.models.user import User
from app.repositories import (
    form_repository,
    organization_repository,
    public_link_repository,
    request_repository,
)
from app.schemas.public_link import (
    PublicFormSummary,
    PublicLinkResponse,
    PublicPageDataResponse,
    PublicPopularFormSummary,
    PublicRequestCreatedResponse,
    PublicRequestSubmission,
)
from app.services import request_analysis_service, request_summary_service

logger = logging.getLogger(__name__)


def _short_description(description: str | None, limit: int = 80) -> str:
    text = (description or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _to_link_response(link: PublicRequestLink) -> PublicLinkResponse:
    return PublicLinkResponse(
        id=str(link.id),
        organization_id=str(link.organization_id),
        token=link.token,
        is_active=link.is_active,
        created_at=link.created_at.isoformat(),
    )


async def _get_org_and_check_owner(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> None:
    org = await organization_repository.get_org_by_id(session, org_id)
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    member = await organization_repository.get_member(session, org_id, current_user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization",
        )


async def get_or_create_link(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> PublicLinkResponse:
    await _get_org_and_check_owner(session, org_id, current_user)

    existing = await public_link_repository.get_by_org(session, org_id)
    if existing:
        return _to_link_response(existing)

    link = PublicRequestLink(
        organization_id=org_id,
        token=secrets.token_urlsafe(48),
    )
    link = await public_link_repository.create(session, link)
    await session.commit()
    return _to_link_response(link)


async def get_public_page_data(
    session: AsyncSession, token: str
) -> PublicPageDataResponse:
    link = await public_link_repository.get_by_token(session, token)
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Public link not found or inactive",
        )

    org = link.organization
    forms = await form_repository.get_all_by_org(session, link.organization_id)

    form_summaries = [
        PublicFormSummary(
            id=str(f.id),
            name=f.name,
            description=f.description or "",
            pages=f.fields if isinstance(f.fields, list) else [],
            is_universal=bool(getattr(f, "is_universal", False)),
        )
        for f in forms
    ]

    sorted_by_usage = sorted(
        forms,
        key=lambda f: (-(getattr(f, "usage_count", 0) or 0), f.name),
    )
    popular_forms = [
        PublicPopularFormSummary(
            id=str(f.id),
            name=f.name,
            short_description=_short_description(f.description),
        )
        for f in sorted_by_usage[:3]
    ]

    univ = await form_repository.get_universal_for_org(session, link.organization_id)
    universal_form_id = str(univ.id) if univ else None

    return PublicPageDataResponse(
        organization_name=org.name,
        organization_description=org.description,
        forms=form_summaries,
        popular_forms=popular_forms,
        universal_form_id=universal_form_id,
    )


async def submit_public_request(
    session: AsyncSession, token: str, payload: PublicRequestSubmission
) -> PublicRequestCreatedResponse:
    link = await public_link_repository.get_by_token(session, token)
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Public link not found or inactive",
        )

    form = await form_repository.get_by_id(session, uuid.UUID(payload.form_id))
    if form is None or form.organization_id != link.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected form does not belong to this organization",
        )

    req = Request(
        title=payload.title,
        form_id=form.id,
        created_by_user_id=None,
        organization_id=link.organization_id,
        data=payload.data,
        status="open",
        execution_status=C.EXEC_NEW,
        form_snapshot=payload.form_snapshot,
        source="public_link",
        applicant_name=payload.full_name,
        applicant_company=payload.applicant_company.strip(),
        applicant_email=str(payload.email) if payload.email else None,
        applicant_phone=payload.phone or None,
    )
    req = await request_repository.create(session, req)
    form.usage_count = getattr(form, "usage_count", 0) + 1
    await form_repository.update(session, form)
    await session.commit()

    try:
        await request_summary_service.generate_summary(session, req.id)
    except Exception:
        logger.exception("AI summary generation failed for public request %s", req.id)

    try:
        await request_analysis_service.generate_analysis(session, req.id)
    except request_analysis_service.AnalysisGenerationFailed:
        logger.warning("AI analysis skipped (LLM unavailable) for public request %s", req.id)
        await session.rollback()
    except Exception:
        logger.exception("AI analysis generation failed for public request %s", req.id)
        await session.rollback()

    return PublicRequestCreatedResponse(
        id=str(req.id),
        title=req.title,
        status=req.status,
        created_at=req.created_at.isoformat(),
    )
