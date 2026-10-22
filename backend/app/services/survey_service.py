import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.knowledge.methodologies import CATEGORIES, METHODOLOGIES
from app.models.survey import Survey, SurveyResponse
from app.models.user import User
from app.repositories import organization_repository, survey_repository
from app.schemas.survey import (
    CreateSurveyRequest,
    MethodologyReportResponse,
    PublicSurveyResponse,
    SubmitSurveyRequest,
    SurveyDetail,
    SurveyListItem,
    SurveyResponseItem,
    SurveyResponsesPage,
    SurveyResults,
    SurveysCounts,
    SurveySubmittedResponse,
    UpdateSurveyRequest,
)
from app.schemas.user import PublicAuthorResponse
from app.services import survey_answers, survey_methodology_service, survey_results

MAX_RESULTS_ROWS = 10_000


def _parse_uuid(value: str, detail: str = "Survey not found") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from None


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


def _meta_for_list(meta: dict[str, Any] | None) -> tuple[str | None, str | None, list[str]]:
    ids = survey_methodology_service.method_ids_from_meta(meta)
    category_id = meta.get("category") if isinstance(meta, dict) else None
    category = CATEGORIES.get(category_id) if isinstance(category_id, str) else None
    return (
        category.id if category else None,
        category.name if category else None,
        [METHODOLOGIES[m].name for m in ids],
    )


def _list_fields(survey: Survey, responses_count: int) -> dict[str, Any]:
    category_id, category_name, names = _meta_for_list(survey.methodology_meta)
    return dict(
        id=str(survey.id),
        name=survey.name,
        description=survey.description or "",
        status=survey.status,
        organization_id=str(survey.organization_id),
        author=_to_author(survey.author),
        category_id=category_id,
        category_name=category_name,
        methodology_names=names,
        questions_count=survey_methodology_service.count_questions(survey.pages),
        responses_count=responses_count,
        public_token=survey.public_token,
        created_at=survey.created_at.isoformat(),
        updated_at=survey.updated_at.isoformat(),
    )


def _to_list_item(survey: Survey, responses_count: int) -> SurveyListItem:
    return SurveyListItem(**_list_fields(survey, responses_count))


def _to_detail(survey: Survey, responses_count: int) -> SurveyDetail:
    return SurveyDetail(
        **_list_fields(survey, responses_count),
        pages=survey.pages if isinstance(survey.pages, list) else [],
        anonymous=survey.anonymous,
        closes_at=survey.closes_at.isoformat() if survey.closes_at else None,
        methodology_meta=survey.methodology_meta,
        methodology_summary=survey_methodology_service.build_summary(
            survey.methodology_meta, survey.pages
        ),
    )


async def _ensure_member(session: AsyncSession, org_id: uuid.UUID, user: User) -> None:
    member = await organization_repository.get_member(session, org_id, user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization",
        )


async def _get_for_member(session: AsyncSession, survey_id: str, user: User) -> Survey:
    survey = await survey_repository.get_by_id(session, _parse_uuid(survey_id))
    if survey is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")
    await _ensure_member(session, survey.organization_id, user)
    return survey


# ─── CRUD ─────────────────────────────────────────────────────────────────────


async def list_surveys(
    session: AsyncSession,
    user: User,
    organization_id: uuid.UUID,
    *,
    status_filter: str | None = None,
    mine: bool = False,
) -> list[SurveyListItem]:
    await _ensure_member(session, organization_id, user)
    surveys = await survey_repository.list_filtered(
        session,
        organization_id=organization_id,
        status=status_filter,
        created_by_user_id=user.id if mine else None,
    )
    counts = await survey_repository.response_counts(session, [s.id for s in surveys])
    return [_to_list_item(s, counts.get(s.id, 0)) for s in surveys]


async def get_counts(
    session: AsyncSession, user: User, organization_id: uuid.UUID
) -> SurveysCounts:
    await _ensure_member(session, organization_id, user)

    async def count(**kwargs: Any) -> int:
        return await survey_repository.count_filtered(
            session, organization_id=organization_id, **kwargs
        )

    return SurveysCounts(
        all=await count(),
        mine=await count(created_by_user_id=user.id),
        open=await count(status="open"),
        draft=await count(status="draft"),
        closed=await count(status="closed"),
        archived=await count(status="archived"),
    )


async def get_survey(session: AsyncSession, user: User, survey_id: str) -> SurveyDetail:
    survey = await _get_for_member(session, survey_id, user)
    counts = await survey_repository.response_counts(session, [survey.id])
    return _to_detail(survey, counts.get(survey.id, 0))


async def create_survey(
    session: AsyncSession, user: User, payload: CreateSurveyRequest
) -> SurveyDetail:
    org_id = _parse_uuid(payload.organization_id, "Organization not found")
    await _ensure_member(session, org_id, user)
    survey = Survey(
        organization_id=org_id,
        created_by_user_id=user.id,
        name=payload.name.strip(),
        description=payload.description,
        pages=payload.pages,
        methodology_meta=payload.methodology_meta,
        status="draft",
        public_token=secrets.token_urlsafe(24),
        anonymous=payload.anonymous,
    )
    survey = await survey_repository.create(session, survey)
    await session.commit()
    return _to_detail(survey, 0)


async def update_survey(
    session: AsyncSession, user: User, survey_id: str, payload: UpdateSurveyRequest
) -> SurveyDetail:
    survey = await _get_for_member(session, survey_id, user)
    survey.name = payload.name.strip()
    survey.description = payload.description
    survey.pages = payload.pages
    survey.methodology_meta = payload.methodology_meta
    survey.anonymous = payload.anonymous
    survey.closes_at = payload.closes_at
    survey.updated_at = datetime.now(timezone.utc)
    survey = await survey_repository.update(session, survey)
    await session.commit()
    counts = await survey_repository.response_counts(session, [survey.id])
    return _to_detail(survey, counts.get(survey.id, 0))


async def set_status(
    session: AsyncSession, user: User, survey_id: str, new_status: str
) -> SurveyDetail:
    survey = await _get_for_member(session, survey_id, user)
    if survey.status == "archived":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Survey is archived")
    if new_status == "open" and survey_methodology_service.count_questions(survey.pages) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="survey_has_no_questions",
        )
    survey.status = new_status
    survey.updated_at = datetime.now(timezone.utc)
    survey = await survey_repository.update(session, survey)
    await session.commit()
    counts = await survey_repository.response_counts(session, [survey.id])
    return _to_detail(survey, counts.get(survey.id, 0))


async def archive_survey(session: AsyncSession, user: User, survey_id: str) -> None:
    survey = await _get_for_member(session, survey_id, user)
    survey.status = "archived"
    survey.updated_at = datetime.now(timezone.utc)
    await survey_repository.update(session, survey)
    await session.commit()


async def get_methodology_report(
    session: AsyncSession, user: User, survey_id: str
) -> MethodologyReportResponse:
    survey = await _get_for_member(session, survey_id, user)
    return survey_methodology_service.build_report(
        survey.name, survey.methodology_meta, survey.pages
    )


# ─── Responses (for members) ──────────────────────────────────────────────────


async def list_responses(
    session: AsyncSession, user: User, survey_id: str, *, limit: int, offset: int
) -> SurveyResponsesPage:
    survey = await _get_for_member(session, survey_id, user)
    rows = await survey_repository.list_responses(session, survey.id, limit=limit, offset=offset)
    return SurveyResponsesPage(
        total=await survey_repository.count_responses(session, survey.id),
        flagged=await survey_repository.count_responses(session, survey.id, flagged_only=True),
        items=[
            SurveyResponseItem(
                id=str(r.id),
                submitted_at=r.submitted_at.isoformat(),
                duration_seconds=r.duration_seconds,
                quality_flags=r.quality_flags,
                answers=r.answers if isinstance(r.answers, dict) else {},
            )
            for r in rows
        ],
    )


async def get_results(
    session: AsyncSession, user: User, survey_id: str, *, exclude_flagged: bool = True
) -> SurveyResults:
    survey = await _get_for_member(session, survey_id, user)
    rows = await survey_repository.list_responses(session, survey.id, limit=MAX_RESULTS_ROWS)
    return survey_results.build_results(survey.pages, rows, exclude_flagged=exclude_flagged)


async def export_responses_csv(
    session: AsyncSession, user: User, survey_id: str
) -> tuple[str, str]:
    survey = await _get_for_member(session, survey_id, user)
    rows = await survey_repository.list_responses(session, survey.id)
    return survey.name, survey_answers.build_csv(survey.pages, list(reversed(rows)))


# ─── Public (respondent) ──────────────────────────────────────────────────────


async def _resolve_open_survey(session: AsyncSession, token: str) -> Survey:
    survey = await survey_repository.get_by_token(session, token)
    if survey is None or survey.status in ("draft", "archived"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="survey_not_found")
    now = datetime.now(timezone.utc)
    if survey.status == "closed" or (survey.closes_at is not None and survey.closes_at <= now):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="survey_closed")
    return survey


async def get_public_survey(session: AsyncSession, token: str) -> PublicSurveyResponse:
    survey = await _resolve_open_survey(session, token)
    org = survey.organization
    return PublicSurveyResponse(
        name=survey.name,
        description=survey.description or "",
        pages=survey_answers.strip_private_config(survey.pages),
        organization_name=org.name if org is not None and not survey.anonymous else None,
        anonymous=survey.anonymous,
    )


async def submit_public_response(
    session: AsyncSession,
    token: str,
    payload: SubmitSurveyRequest,
    *,
    user_agent: str | None = None,
) -> SurveySubmittedResponse:
    survey = await _resolve_open_survey(session, token)
    try:
        answers = survey_answers.validate_answers(survey.pages, payload.answers)
    except survey_answers.AnswersError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": exc.code, "missing": exc.missing},
        ) from exc
    if not answers:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "empty_answers", "missing": []},
        )
    flags = survey_answers.quality_flags(survey.pages, answers, payload.duration_seconds)
    response = SurveyResponse(
        survey_id=survey.id,
        answers=answers,
        schema_snapshot=survey.pages if isinstance(survey.pages, list) else [],
        quality_flags=flags,
        respondent_meta=None if survey.anonymous else {"user_agent": (user_agent or "")[:200]},
        duration_seconds=payload.duration_seconds,
    )
    response = await survey_repository.add_response(session, response)
    await session.commit()
    return SurveySubmittedResponse(id=str(response.id))
