import uuid
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.api.deps import CurrentUser, DbSession
from app.models.user import User
from app.schemas.survey import (
    CreateProjectRequest,
    CreateSurveyRequest,
    CrosstabResult,
    MethodologyCatalogResponse,
    MethodologyReportRequest,
    MethodologyReportResponse,
    MoveSurveyRequest,
    PublicSurveyResponse,
    QuestionAnswersPage,
    SubmitSurveyRequest,
    SurveyAiAnalysisChatRequest,
    SurveyAiAnalysisChatResponse,
    SurveyAiBuildRequest,
    SurveyAiBuildResponse,
    SurveyAiSummary,
    SurveyAiSummaryRequest,
    SurveyDetail,
    SurveyListItem,
    SurveyProjectItem,
    SurveyResponseDetail,
    SurveyResponsesPage,
    SurveyResults,
    SurveysCounts,
    SurveyStatusRequest,
    SurveySubmittedResponse,
    UpdateProjectRequest,
    UpdateSurveyRequest,
)
from app.schemas.survey_demo import (
    DemoResponsesRemoved,
    DemoResponsesRequest,
    DemoResponsesResult,
)
from app.services import (
    ai_meter,
    billing_guard,
    email_service,
    survey_ai_builder_service,
    survey_demo_service,
    survey_methodology_service,
    survey_service,
)
from app.core.client_ip import client_ip
from app.services.public_suggest_rate_limit import check_public_suggest_limit

router = APIRouter()
public_router = APIRouter()
methodologies_router = APIRouter()
projects_router = APIRouter()


# ─── Methodology catalogue ────────────────────────────────────────────────────


@methodologies_router.get("", response_model=MethodologyCatalogResponse)
async def get_methodologies(_user: CurrentUser) -> MethodologyCatalogResponse:
    return survey_methodology_service.get_catalog()


@methodologies_router.post("/report", response_model=MethodologyReportResponse)
async def build_methodology_report(
    payload: MethodologyReportRequest, _user: CurrentUser
) -> MethodologyReportResponse:
    """Report for a survey that is not saved yet (builder preview)."""
    return survey_methodology_service.build_report(
        payload.name.strip() or "Без названия", payload.methodology_meta, payload.pages
    )


# ─── Projects (folders of surveys) ────────────────────────────────────────────


@projects_router.get("", response_model=list[SurveyProjectItem])
async def list_projects(
    session: DbSession, user: CurrentUser, organization_id: uuid.UUID = Query(...)
) -> list[SurveyProjectItem]:
    return await survey_service.list_projects(session, user, organization_id)


@projects_router.post("", response_model=SurveyProjectItem, status_code=201)
async def create_project(
    payload: CreateProjectRequest, session: DbSession, user: CurrentUser
) -> SurveyProjectItem:
    return await survey_service.create_project(session, user, payload)


@projects_router.get("/{project_id}", response_model=SurveyProjectItem)
async def get_project(
    project_id: str, session: DbSession, user: CurrentUser
) -> SurveyProjectItem:
    return await survey_service.get_project(session, user, project_id)


@projects_router.put("/{project_id}", response_model=SurveyProjectItem)
async def update_project(
    project_id: str, payload: UpdateProjectRequest, session: DbSession, user: CurrentUser
) -> SurveyProjectItem:
    return await survey_service.update_project(session, user, project_id, payload)


@projects_router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, session: DbSession, user: CurrentUser) -> None:
    await survey_service.delete_project(session, user, project_id)


# ─── Surveys (organization members) ───────────────────────────────────────────


@router.get("", response_model=list[SurveyListItem])
async def list_surveys(
    session: DbSession,
    user: CurrentUser,
    organization_id: uuid.UUID = Query(...),
    status_filter: str | None = Query(default=None, alias="status"),
    mine: bool = Query(default=False),
    project_id: str | None = Query(default=None),
) -> list[SurveyListItem]:
    return await survey_service.list_surveys(
        session,
        user,
        organization_id,
        status_filter=status_filter,
        mine=mine,
        project_id=project_id,
    )


@router.get("/counts", response_model=SurveysCounts)
async def surveys_counts(
    session: DbSession,
    user: CurrentUser,
    organization_id: uuid.UUID = Query(...),
    project_id: str | None = Query(default=None),
) -> SurveysCounts:
    return await survey_service.get_counts(session, user, organization_id, project_id)


@router.post("/ai-builder", response_model=SurveyAiBuildResponse)
async def build_survey_with_ai(
    payload: SurveyAiBuildRequest, session: DbSession, user: CurrentUser
) -> SurveyAiBuildResponse:
    # Unconfirmed accounts are rejected before the burst limit so they cannot use up its budget
    _require_verified_email(user)
    _ai_rate_limit(user.id)
    ent = await billing_guard.entitlements(session, user)
    # Methodologies picked by hand that the plan does not include are refused before any AI is spent
    billing_guard.ensure_methodologies(ent, payload.methodology_ids)
    # Existing pages in the request mean the user is refining a survey, not building a new one
    action = ai_meter.ACTION_SURVEY_EDIT if payload.pages else ai_meter.ACTION_SURVEY_BUILD
    async with ai_meter.action(user, action):
        return await survey_ai_builder_service.build_survey(
            payload,
            allowed_methodologies=billing_guard.allowed_methodologies(ent),
            max_questions=billing_guard.question_cap(ent),
        )


@router.post("", response_model=SurveyDetail, status_code=201)
async def create_survey(
    payload: CreateSurveyRequest, session: DbSession, user: CurrentUser
) -> SurveyDetail:
    return await survey_service.create_survey(session, user, payload)


@router.get("/{survey_id}", response_model=SurveyDetail)
async def get_survey(survey_id: str, session: DbSession, user: CurrentUser) -> SurveyDetail:
    return await survey_service.get_survey(session, user, survey_id)


@router.put("/{survey_id}", response_model=SurveyDetail)
async def update_survey(
    survey_id: str, payload: UpdateSurveyRequest, session: DbSession, user: CurrentUser
) -> SurveyDetail:
    return await survey_service.update_survey(session, user, survey_id, payload)


@router.patch("/{survey_id}/project", response_model=SurveyDetail)
async def move_survey(
    survey_id: str, payload: MoveSurveyRequest, session: DbSession, user: CurrentUser
) -> SurveyDetail:
    return await survey_service.move_survey(session, user, survey_id, payload.project_id)


@router.patch("/{survey_id}/status", response_model=SurveyDetail)
async def set_survey_status(
    survey_id: str, payload: SurveyStatusRequest, session: DbSession, user: CurrentUser
) -> SurveyDetail:
    return await survey_service.set_status(session, user, survey_id, payload.status)


@router.post("/{survey_id}/demo-responses", response_model=DemoResponsesResult, status_code=201)
async def add_demo_responses(
    survey_id: str, payload: DemoResponsesRequest, session: DbSession, user: CurrentUser
) -> DemoResponsesResult:
    """Guided tour: fill a published survey that has no answers yet with made-up test responses."""
    return await survey_demo_service.add_demo_responses(session, user, survey_id, payload.count)


@router.delete("/{survey_id}/demo-responses", response_model=DemoResponsesRemoved)
async def remove_demo_responses(
    survey_id: str, session: DbSession, user: CurrentUser
) -> DemoResponsesRemoved:
    """Remove the test responses made for the guided tour; real responses stay."""
    return await survey_demo_service.remove_demo_responses(session, user, survey_id)


@router.delete("/{survey_id}", status_code=204)
async def archive_survey(survey_id: str, session: DbSession, user: CurrentUser) -> None:
    await survey_service.archive_survey(session, user, survey_id)


@router.get("/{survey_id}/methodology-report", response_model=MethodologyReportResponse)
async def get_methodology_report(
    survey_id: str, session: DbSession, user: CurrentUser
) -> MethodologyReportResponse:
    return await survey_service.get_methodology_report(session, user, survey_id)


@router.get("/{survey_id}/responses", response_model=SurveyResponsesPage)
async def list_responses(
    survey_id: str,
    session: DbSession,
    user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    flagged: bool | None = Query(default=None, description="true — only with quality flags, false — only without"),
    order: Literal["newest", "oldest"] = Query(default="newest"),
) -> SurveyResponsesPage:
    return await survey_service.list_responses(
        session,
        user,
        survey_id,
        limit=limit,
        offset=offset,
        flagged=flagged,
        newest_first=order == "newest",
    )


@router.get("/{survey_id}/questions/{field_id}/answers", response_model=QuestionAnswersPage)
async def get_question_answers(
    survey_id: str,
    field_id: str,
    session: DbSession,
    user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    exclude_flagged: bool = Query(default=True),
) -> QuestionAnswersPage:
    return await survey_service.get_question_answers(
        session,
        user,
        survey_id,
        field_id,
        limit=limit,
        offset=offset,
        exclude_flagged=exclude_flagged,
    )


@router.get("/{survey_id}/results", response_model=SurveyResults)
async def get_results(
    survey_id: str,
    session: DbSession,
    user: CurrentUser,
    exclude_flagged: bool = Query(default=True),
) -> SurveyResults:
    return await survey_service.get_results(
        session, user, survey_id, exclude_flagged=exclude_flagged
    )


@router.get("/{survey_id}/crosstab", response_model=CrosstabResult)
async def get_crosstab(
    survey_id: str,
    session: DbSession,
    user: CurrentUser,
    row: str = Query(..., min_length=1, max_length=100),
    col: str = Query(..., min_length=1, max_length=100),
    exclude_flagged: bool = Query(default=True),
) -> CrosstabResult:
    return await survey_service.get_crosstab(
        session, user, survey_id, row, col, exclude_flagged=exclude_flagged
    )


def _require_verified_email(user: User) -> None:
    # Without SMTP nobody is asked to confirm the mailbox (the link only goes to the server log),
    # so insisting on it would lock new accounts out of the builder for good
    if email_service.is_configured() and user.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Подтвердите адрес почты по ссылке из письма, чтобы пользоваться ИИ-конструктором.",
        )


def _ai_rate_limit(user_id: uuid.UUID) -> None:
    if not check_public_suggest_limit(f"survey-ai:{user_id}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов к ИИ. Подождите немного и попробуйте снова.",
        )


@router.get("/{survey_id}/ai-summary", response_model=SurveyAiSummary | None)
async def get_ai_summary(
    survey_id: str, session: DbSession, user: CurrentUser
) -> SurveyAiSummary | None:
    return await survey_service.get_ai_summary(session, user, survey_id)


@router.post("/{survey_id}/ai-summary", response_model=SurveyAiSummary)
async def generate_ai_summary(
    survey_id: str, payload: SurveyAiSummaryRequest, session: DbSession, user: CurrentUser
) -> SurveyAiSummary:
    _ai_rate_limit(user.id)
    return await survey_service.generate_ai_summary(session, user, survey_id, payload)


@router.post("/{survey_id}/ai-chat", response_model=SurveyAiAnalysisChatResponse)
async def ai_chat(
    survey_id: str, payload: SurveyAiAnalysisChatRequest, session: DbSession, user: CurrentUser
) -> SurveyAiAnalysisChatResponse:
    _ai_rate_limit(user.id)
    return await survey_service.ai_chat(session, user, survey_id, payload)


@router.get("/{survey_id}/responses/export.csv")
async def export_responses_csv(survey_id: str, session: DbSession, user: CurrentUser) -> Response:
    name, content = await survey_service.export_responses_csv(session, user, survey_id)
    filename = quote(f"{name[:80]}.csv")
    return Response(
        content="﻿" + content,  # BOM so Excel opens UTF-8 correctly
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


# Declared after ``responses/export.csv`` so that "export.csv" is not taken for a response id
@router.get("/{survey_id}/responses/{response_id}", response_model=SurveyResponseDetail)
async def get_response_detail(
    survey_id: str, response_id: str, session: DbSession, user: CurrentUser
) -> SurveyResponseDetail:
    return await survey_service.get_response_detail(session, user, survey_id, response_id)


# ─── Respondent (public) ──────────────────────────────────────────────────────


@public_router.get("/{token}", response_model=PublicSurveyResponse)
async def get_public_survey(token: str, session: DbSession) -> PublicSurveyResponse:
    return await survey_service.get_public_survey(session, token)


@public_router.post(
    "/{token}/responses", response_model=SurveySubmittedResponse, status_code=201
)
async def submit_public_response(
    token: str, payload: SubmitSurveyRequest, session: DbSession, request: Request
) -> SurveySubmittedResponse:
    ip = client_ip(request)
    if not check_public_suggest_limit(f"survey-submit:{token}:{ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов. Подождите минуту и попробуйте снова.",
        )
    return await survey_service.submit_public_response(
        session, token, payload, user_agent=request.headers.get("user-agent")
    )
