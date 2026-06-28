from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.request_execution import (
    RequestExecutionEventResponse,
    RequestStageResponse,
)
from app.schemas.request_workflow import (
    RequestHistoryEventResponse,
    RequestTaskResponse,
)
from app.schemas.user import PublicAuthorResponse


class CreateRequestPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    form_id: str
    organization_id: str | None = None
    data: Any = None
    status: str = "open"
    form_snapshot: Any = None


class UpdateRequestPayload(BaseModel):
    title: str | None = None
    status: str | None = None
    closedAt: str | None = None
    data: Any = None


class PatchStatusPayload(BaseModel):
    status: str = Field(..., min_length=1)


class AISummaryResponse(BaseModel):
    summary: str
    priority: str
    tags: list[str]


class AIAnalysisIssueResponse(BaseModel):
    type: str
    severity: Literal["low", "medium", "high"] = "medium"
    field: str = "general"
    message: str


class AIRequestAnalysisResponse(BaseModel):
    status: Literal["ready", "needs_clarification", "not_ready"]
    completeness_score: int = Field(..., ge=0, le=100)
    ready_for_processing: bool
    issues: list[AIAnalysisIssueResponse]
    strengths: list[str] = []
    recommendation: str


class RequestPersonResponse(BaseModel):
    """A person related to a request (author, assignee, etc.)."""
    role: str
    name: str
    email: str | None = None
    phone: str | None = None
    source: str


class RequestResponse(BaseModel):
    id: str
    title: str
    form_id: str
    organization_id: str | None
    data: Any
    status: str
    deleted: bool = False
    closedAt: str | None
    created_by_user_id: str | None
    author: PublicAuthorResponse | None
    created_at: str
    updated_at: str
    form_snapshot: Any | None = None
    ai_summary: AISummaryResponse | None = None
    ai_analysis: AIRequestAnalysisResponse | None = None
    source: str | None = None
    applicant_name: str | None = None
    applicant_company: str | None = None
    applicant_email: str | None = None
    applicant_phone: str | None = None
    people: list[RequestPersonResponse] = []
    assigned_kind: str | None = None
    assigned_performer_id: str | None = None
    execution_status: str | None = None
    stages: list[RequestStageResponse] = []
    execution_events: list[RequestExecutionEventResponse] = []
    workflow_status: str = "new"
    priority: str = "medium"
    due_date: str | None = None
    responsible_user_id: str | None = None
    responsible_user: PublicAuthorResponse | None = None
    tasks: list[RequestTaskResponse] = []
    history: list[RequestHistoryEventResponse] = []
    ai_tz: dict | None = None
