import secrets
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import FEATURE_CROSSTABS, FEATURE_CSV_EXPORT
from app.knowledge.methodologies import CATEGORIES, METHODOLOGIES
from app.models.survey import Survey, SurveyProject, SurveyResponse
from app.models.user import User
from app.repositories import organization_repository, survey_repository
from app.schemas.survey import (
    CreateProjectRequest,
    CreateSurveyRequest,
    CrosstabResult,
    MethodologyReportResponse,
    PublicSurveyResponse,
    QualityReasonOut,
    QuestionAnswerItem,
    QuestionAnswersPage,
    SubmitSurveyRequest,
    SurveyAiAnalysisChatRequest,
    SurveyAiAnalysisChatResponse,
    SurveyAiSummary,
    SurveyAiSummaryRequest,
    SurveyDetail,
    SurveyListItem,
    SurveyProjectItem,
    SurveyQuestion,
    SurveyResponseDetail,
    ResponsePreview,
    SurveyResponseItem,
    SurveyResponsesPage,
    SurveyResults,
    SurveysCounts,
    SurveySubmittedResponse,
    UpdateProjectRequest,
    UpdateSurveyRequest,
)
from app.schemas.user import PublicAuthorResponse
from app.services import (
    ai_meter,
    billing_guard,
    survey_ai_analysis_service,
    survey_answers,
    survey_methodology_service,
    survey_quality,
    survey_results,
)

MAX_RESULTS_ROWS = 10_000
DEFAULT_PROJECT_NAME = "Мои опросы"


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


def _list_fields(
    survey: Survey, responses_count: int, last_response_at: datetime | None = None
) -> dict[str, Any]:
    category_id, category_name, names = _meta_for_list(survey.methodology_meta)
    return dict(
        id=str(survey.id),
        name=survey.name,
        description=survey.description or "",
        status=survey.status,
        organization_id=str(survey.organization_id),
        project_id=str(survey.project_id),
        project_name=survey.project.name,
        author=_to_author(survey.author),
        category_id=category_id,
        category_name=category_name,
        methodology_names=names,
        questions_count=survey_methodology_service.count_questions(survey.pages),
        responses_count=responses_count,
        last_response_at=last_response_at.isoformat() if last_response_at else None,
        public_token=survey.public_token,
        created_at=survey.created_at.isoformat(),
        updated_at=survey.updated_at.isoformat(),
    )


def _to_list_item(
    survey: Survey, responses_count: int, last_response_at: datetime | None = None
) -> SurveyListItem:
    return SurveyListItem(**_list_fields(survey, responses_count, last_response_at))


def _to_detail(
    survey: Survey, responses_count: int, last_response_at: datetime | None = None
) -> SurveyDetail:
    return SurveyDetail(
        **_list_fields(survey, responses_count, last_response_at),
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


def _to_project_item(project: SurveyProject, surveys_count: int) -> SurveyProjectItem:
    return SurveyProjectItem(
        id=str(project.id),
        organization_id=str(project.organization_id),
        name=project.name,
        description=project.description,
        color=getattr(project, "color", None),
        surveys_count=surveys_count,
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
    )


async def _get_project_for_member(
    session: AsyncSession, project_id: str, user: User
) -> SurveyProject:
    project = await survey_repository.get_project(
        session, _parse_uuid(project_id, "Project not found")
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    await _ensure_member(session, project.organization_id, user)
    return project


async def _project_in_organization(
    session: AsyncSession, project_id: str, organization_id: uuid.UUID
) -> SurveyProject:
    """A project of this very organization — a foreign or unknown one is "not found"."""
    project = await survey_repository.get_project(
        session, _parse_uuid(project_id, "Project not found")
    )
    if project is None or project.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


# ─── Projects ─────────────────────────────────────────────────────────────────


async def list_projects(
    session: AsyncSession, user: User, organization_id: uuid.UUID
) -> list[SurveyProjectItem]:
    await _ensure_member(session, organization_id, user)
    projects = await survey_repository.list_projects(session, organization_id)
    counts = await survey_repository.survey_counts_by_project(session, [p.id for p in projects])
    return [_to_project_item(p, counts.get(p.id, 0)) for p in projects]


async def get_project(session: AsyncSession, user: User, project_id: str) -> SurveyProjectItem:
    project = await _get_project_for_member(session, project_id, user)
    counts = await survey_repository.survey_counts_by_project(session, [project.id])
    return _to_project_item(project, counts.get(project.id, 0))


async def create_project(
    session: AsyncSession, user: User, payload: CreateProjectRequest
) -> SurveyProjectItem:
    org_id = _parse_uuid(payload.organization_id, "Organization not found")
    await _ensure_member(session, org_id, user)
    # Only an explicit "new project" counts; the default project a first survey gets is not refused
    await billing_guard.ensure_can_add_project(session, user)
    project = await survey_repository.create_project(
        session,
        SurveyProject(
            organization_id=org_id,
            created_by_user_id=user.id,
            name=payload.name,
            description=payload.description,
            color=payload.color,
        ),
    )
    await session.commit()
    return _to_project_item(project, 0)


async def update_project(
    session: AsyncSession, user: User, project_id: str, payload: UpdateProjectRequest
) -> SurveyProjectItem:
    """Rename / re-describe / recolour: the surveys of the project and their ids are not touched."""
    project = await _get_project_for_member(session, project_id, user)
    project.name = payload.name
    project.description = payload.description
    project.color = payload.color
    project.updated_at = datetime.now(timezone.utc)
    project = await survey_repository.update_project(session, project)
    await session.commit()
    counts = await survey_repository.survey_counts_by_project(session, [project.id])
    return _to_project_item(project, counts.get(project.id, 0))


async def delete_project(session: AsyncSession, user: User, project_id: str) -> None:
    """Only an empty project can go: surveys (and their answers) are never deleted with it."""
    project = await _get_project_for_member(session, project_id, user)
    if await survey_repository.count_all_in_project(session, project.id) > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="project_not_empty")
    await survey_repository.delete_project(session, project)
    await session.commit()


async def _resolve_project_for_new_survey(
    session: AsyncSession, user: User, organization_id: uuid.UUID, project_id: str | None
) -> SurveyProject:
    if project_id:
        return await _project_in_organization(session, project_id, organization_id)
    project = await survey_repository.get_default_project(session, organization_id)
    if project is None:
        project = await survey_repository.create_project(
            session,
            SurveyProject(
                organization_id=organization_id,
                created_by_user_id=user.id,
                name=DEFAULT_PROJECT_NAME,
            ),
        )
    return project


# ─── CRUD ─────────────────────────────────────────────────────────────────────


async def list_surveys(
    session: AsyncSession,
    user: User,
    organization_id: uuid.UUID,
    *,
    status_filter: str | None = None,
    mine: bool = False,
    project_id: str | None = None,
) -> list[SurveyListItem]:
    await _ensure_member(session, organization_id, user)
    project = (
        await _project_in_organization(session, project_id, organization_id)
        if project_id
        else None
    )
    surveys = await survey_repository.list_filtered(
        session,
        organization_id=organization_id,
        status=status_filter,
        created_by_user_id=user.id if mine else None,
        project_id=project.id if project else None,
    )
    ids = [s.id for s in surveys]
    counts = await survey_repository.response_counts(session, ids)
    last_dates = await survey_repository.last_response_dates(session, ids)
    return [_to_list_item(s, counts.get(s.id, 0), last_dates.get(s.id)) for s in surveys]


async def get_counts(
    session: AsyncSession,
    user: User,
    organization_id: uuid.UUID,
    project_id: str | None = None,
) -> SurveysCounts:
    await _ensure_member(session, organization_id, user)
    project = (
        await _project_in_organization(session, project_id, organization_id)
        if project_id
        else None
    )

    async def count(**kwargs: Any) -> int:
        return await survey_repository.count_filtered(
            session,
            organization_id=organization_id,
            project_id=project.id if project else None,
            **kwargs,
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
    last_dates = await survey_repository.last_response_dates(session, [survey.id])
    return _to_detail(survey, counts.get(survey.id, 0), last_dates.get(survey.id))


async def create_survey(
    session: AsyncSession, user: User, payload: CreateSurveyRequest
) -> SurveyDetail:
    org_id = _parse_uuid(payload.organization_id, "Organization not found")
    await _ensure_member(session, org_id, user)
    await billing_guard.ensure_questions_within_limit(session, user, payload.pages)
    project = await _resolve_project_for_new_survey(session, user, org_id, payload.project_id)
    survey = Survey(
        organization_id=org_id,
        project=project,
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
    await billing_guard.ensure_questions_within_limit(
        session, user, payload.pages, previous_pages=survey.pages
    )
    # Locked responses are answers to the current form as well: the structure stays fixed for them
    if await survey_repository.count_responses(session, survey.id, include_locked=True) > 0:
        problems = survey_answers.structure_conflicts(survey.pages, payload.pages)
        if problems:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "survey_structure_locked", "problems": problems},
            )
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


async def move_survey(
    session: AsyncSession, user: User, survey_id: str, project_id: str
) -> SurveyDetail:
    """Only ``project_id`` changes: the id, public link, answers and analytics stay as they were."""
    survey = await _get_for_member(session, survey_id, user)
    target = await _project_in_organization(session, project_id, survey.organization_id)
    if survey.project_id != target.id:
        survey.project = target
        survey = await survey_repository.update(session, survey)
        await session.commit()
    counts = await survey_repository.response_counts(session, [survey.id])
    last_dates = await survey_repository.last_response_dates(session, [survey.id])
    return _to_detail(survey, counts.get(survey.id, 0), last_dates.get(survey.id))


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
    if new_status == "open" and survey.status != "open":
        # Publishing is what the plan limits: how many surveys are live, and how long they are
        await billing_guard.ensure_can_open_survey(session, user)
        await billing_guard.ensure_questions_within_limit(session, user, survey.pages)
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
    session: AsyncSession,
    user: User,
    survey_id: str,
    *,
    limit: int,
    offset: int,
    flagged: bool | None = None,
    newest_first: bool = True,
) -> SurveyResponsesPage:
    """``total`` counts the responses under the filter; ``flagged`` is always the overall count."""
    survey = await _get_for_member(session, survey_id, user)
    rows, total = await survey_repository.list_numbered_responses(
        session,
        survey.id,
        limit=limit,
        offset=offset,
        flagged=flagged,
        newest_first=newest_first,
    )
    return SurveyResponsesPage(
        total=total,
        flagged=await survey_repository.count_responses(session, survey.id, flagged_only=True),
        items=[
            SurveyResponseItem(
                id=str(r.id),
                number=number,
                submitted_at=r.submitted_at.isoformat(),
                duration_seconds=r.duration_seconds,
                quality_flags=r.quality_flags,
                quality_status=survey_quality.status_of(r.quality_flags),
                answers=r.answers if isinstance(r.answers, dict) else {},
                preview=[
                    ResponsePreview(**item)
                    for item in survey_answers.preview_items(
                        r.schema_snapshot if survey_answers.question_defs(r.schema_snapshot) else survey.pages,
                        r.answers if isinstance(r.answers, dict) else {},
                    )
                ],
            )
            for r, number in rows
        ],
    )


async def get_response_detail(
    session: AsyncSession, user: User, survey_id: str, response_id: str
) -> SurveyResponseDetail:
    survey = await _get_for_member(session, survey_id, user)
    response = await survey_repository.get_response(
        session, survey.id, _parse_uuid(response_id, "Response not found")
    )
    if response is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Response not found")
    # The form as the respondent saw it; the survey may have been edited since
    questions = survey_answers.question_defs(response.schema_snapshot)
    questions_from_snapshot = bool(questions)
    if not questions:
        questions = survey_answers.question_defs(survey.pages)
    older, newer = await survey_repository.neighbour_response_ids(session, survey.id, response)
    return SurveyResponseDetail(
        id=str(response.id),
        number=await survey_repository.response_number(session, survey.id, response.id),
        total=await survey_repository.count_responses(session, survey.id),
        submitted_at=response.submitted_at.isoformat(),
        duration_seconds=response.duration_seconds,
        quality_flags=response.quality_flags,
        quality_status=survey_quality.status_of(response.quality_flags),
        quality_reasons=[
            QualityReasonOut(**asdict(reason))
            for reason in survey_quality.explain(
                response.schema_snapshot if questions_from_snapshot else survey.pages,
                response.answers if isinstance(response.answers, dict) else {},
                response.duration_seconds,
                response.quality_flags,
            )
        ],
        answers=response.answers if isinstance(response.answers, dict) else {},
        questions=[SurveyQuestion(**q) for q in questions],
        prev_id=str(older) if older else None,
        next_id=str(newer) if newer else None,
    )


async def get_question_answers(
    session: AsyncSession,
    user: User,
    survey_id: str,
    field_id: str,
    *,
    limit: int,
    offset: int,
    exclude_flagged: bool = True,
) -> QuestionAnswersPage:
    """All answers to one open question, each linked to the response it came from."""
    survey = await _get_for_member(session, survey_id, user)
    field = next((f for f in survey_answers.answerable_fields(survey.pages) if f["id"] == field_id), None)
    if field is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="question_not_found")
    if field.get("type") in survey_results.CHOICE_TYPES or field.get("type") in survey_results.SCALE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="not_an_open_question"
        )
    analysis = await billing_guard.load_analysis(
        session, user, survey.id, ceiling=MAX_RESULTS_ROWS, exclude_flagged=exclude_flagged
    )
    rows = analysis.rows
    exclude_flagged = analysis.exclude_flagged
    # ``rows`` is newest first; the arrival number counts from the oldest response of the survey
    total_rows = analysis.total
    items: list[QuestionAnswerItem] = []
    for index, row in enumerate(rows):
        if exclude_flagged and survey_quality.excludes_from_analysis(row.quality_flags):
            continue
        value = row.answers.get(field_id) if isinstance(row.answers, dict) else None
        if isinstance(value, str) and value.strip():
            items.append(
                QuestionAnswerItem(
                    response_id=str(row.id),
                    number=total_rows - index,
                    submitted_at=row.submitted_at.isoformat(),
                    text=value.strip(),
                )
            )
    return QuestionAnswersPage(
        field_id=field_id,
        label=str(field.get("label") or field_id),
        total=len(items),
        items=items[offset : offset + limit],
    )


async def get_results(
    session: AsyncSession, user: User, survey_id: str, *, exclude_flagged: bool = True
) -> SurveyResults:
    survey = await _get_for_member(session, survey_id, user)
    analysis = await billing_guard.load_analysis(
        session, user, survey.id, ceiling=MAX_RESULTS_ROWS, exclude_flagged=exclude_flagged
    )
    return survey_results.build_results(
        survey.pages, analysis.rows, exclude_flagged=analysis.exclude_flagged
    )


async def get_crosstab(
    session: AsyncSession,
    user: User,
    survey_id: str,
    row_id: str,
    col_id: str,
    *,
    exclude_flagged: bool = True,
) -> CrosstabResult:
    survey = await _get_for_member(session, survey_id, user)
    await billing_guard.ensure_feature(session, user, FEATURE_CROSSTABS)
    analysis = await billing_guard.load_analysis(
        session, user, survey.id, ceiling=MAX_RESULTS_ROWS, exclude_flagged=exclude_flagged
    )
    try:
        return survey_results.build_crosstab(
            survey.pages, analysis.rows, row_id, col_id, exclude_flagged=analysis.exclude_flagged
        )
    except survey_results.CrosstabError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.code
        ) from exc


def _stored_summary(survey: Survey) -> dict[str, Any] | None:
    stored = survey.ai_summary
    if (
        isinstance(stored, dict)
        and isinstance(stored.get("bullets"), list)
        and isinstance(stored.get("responses_used"), int)
    ):
        return stored
    return None


def _to_ai_summary(stored: dict[str, Any], *, stale: bool) -> SurveyAiSummary:
    evidence = stored.get("evidence")
    return SurveyAiSummary(
        bullets=[str(b) for b in stored["bullets"]],
        evidence=[[str(i) for i in ids] for ids in evidence] if isinstance(evidence, list) else [],
        generated_at=str(stored.get("generated_at", "")),
        responses_used=stored["responses_used"],
        exclude_flagged=bool(stored.get("exclude_flagged", True)),
        stale=stale,
    )


async def get_ai_summary(
    session: AsyncSession, user: User, survey_id: str
) -> SurveyAiSummary | None:
    """The cached summary (``stale`` when responses arrived since), None if never generated."""
    survey = await _get_for_member(session, survey_id, user)
    stored = _stored_summary(survey)
    if stored is None:
        return None
    total = await survey_repository.count_responses(session, survey.id)
    if stored.get("exclude_flagged", True):
        total -= await survey_repository.count_responses(session, survey.id, flagged_only=True)
    return _to_ai_summary(stored, stale=total != stored["responses_used"])


async def generate_ai_summary(
    session: AsyncSession, user: User, survey_id: str, payload: SurveyAiSummaryRequest
) -> SurveyAiSummary:
    survey = await _get_for_member(session, survey_id, user)
    analysis = await billing_guard.load_analysis(
        session, user, survey.id, ceiling=MAX_RESULTS_ROWS, exclude_flagged=payload.exclude_flagged
    )
    rows = analysis.rows
    exclude_flagged = analysis.exclude_flagged
    results = survey_results.build_results(survey.pages, rows, exclude_flagged=exclude_flagged)
    stored = _stored_summary(survey)
    if (
        stored is not None
        and not payload.force
        and stored["responses_used"] == results.used
        and bool(stored.get("exclude_flagged", True)) == exclude_flagged
    ):
        return _to_ai_summary(stored, stale=False)
    comparisons = survey_ai_analysis_service.segment_comparisons(
        survey.pages, rows, exclude_flagged=exclude_flagged
    )
    # Charged only here: a summary served from the cache above costs nothing
    async with ai_meter.action(user, ai_meter.ACTION_AI_SUMMARY, survey_id=survey.id):
        bullets, evidence = await survey_ai_analysis_service.generate_summary(
            survey.name, results, comparisons
        )
    survey.ai_summary = {
        "bullets": bullets,
        "evidence": evidence,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "responses_used": results.used,
        "exclude_flagged": exclude_flagged,
    }
    await survey_repository.update(session, survey)
    await session.commit()
    return _to_ai_summary(survey.ai_summary, stale=False)


async def ai_chat(
    session: AsyncSession, user: User, survey_id: str, payload: SurveyAiAnalysisChatRequest
) -> SurveyAiAnalysisChatResponse:
    survey = await _get_for_member(session, survey_id, user)
    if payload.messages[-1].role != "user":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="last_message_must_be_user"
        )
    analysis = await billing_guard.load_analysis(
        session, user, survey.id, ceiling=MAX_RESULTS_ROWS, exclude_flagged=payload.exclude_flagged
    )
    async with ai_meter.action(user, ai_meter.ACTION_AI_CHAT, survey_id=survey.id):
        return await survey_ai_analysis_service.chat(
            survey.name,
            survey.pages,
            analysis.rows,
            payload.messages,
            exclude_flagged=analysis.exclude_flagged,
            allow_crosstab=analysis.crosstab_allowed,
        )


async def export_responses_csv(
    session: AsyncSession, user: User, survey_id: str
) -> tuple[str, str]:
    survey = await _get_for_member(session, survey_id, user)
    await billing_guard.ensure_feature(session, user, FEATURE_CSV_EXPORT)
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
    flags = survey_quality.detect_flags(survey.pages, answers, payload.duration_seconds)
    # Over the owner's quota the answer is still accepted (the respondent sees no difference),
    # but it stays locked until the plan grows
    locked = await billing_guard.register_response(session, survey)
    response = SurveyResponse(
        survey_id=survey.id,
        answers=answers,
        schema_snapshot=survey.pages if isinstance(survey.pages, list) else [],
        quality_flags=flags,
        locked=locked,
        respondent_meta=None if survey.anonymous else {"user_agent": (user_agent or "")[:200]},
        duration_seconds=payload.duration_seconds,
    )
    response = await survey_repository.add_response(session, response)
    await session.commit()
    return SurveySubmittedResponse(id=str(response.id))
