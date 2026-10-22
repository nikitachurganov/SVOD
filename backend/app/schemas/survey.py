from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.user import PublicAuthorResponse

SurveyStatus = Literal["draft", "open", "closed", "archived"]


# ─── Methodology ──────────────────────────────────────────────────────────────


class MethodologyItem(BaseModel):
    id: str
    name: str
    summary: str
    questions_count: int = 0
    survey_level: bool = False


class MethodologyWarning(BaseModel):
    rule: str
    field: str = ""
    message: str


class MethodologySummary(BaseModel):
    category_id: str | None = None
    category_name: str | None = None
    goals: list[str] = Field(default_factory=list)
    methodologies: list[MethodologyItem] = Field(default_factory=list)
    warnings: list[MethodologyWarning] = Field(default_factory=list)
    standards_note: str = ""


class MethodologyCatalogItem(BaseModel):
    id: str
    category_id: str
    name: str
    summary: str
    when_to_use: str


class MethodologyCatalogCategory(BaseModel):
    id: str
    name: str
    goal: str


class MethodologyCatalogResponse(BaseModel):
    version: str
    categories: list[MethodologyCatalogCategory]
    methodologies: list[MethodologyCatalogItem]


class MethodologyReportRequest(BaseModel):
    name: str = Field(default="", max_length=500)
    methodology_meta: dict[str, Any] | None = None
    pages: list[Any] = Field(default_factory=list)


class MethodologyReportResponse(BaseModel):
    title: str
    markdown: str
    bibliography: list[str]
    has_unverified_sources: bool = False


# ─── Survey CRUD ──────────────────────────────────────────────────────────────


class CreateSurveyRequest(BaseModel):
    organization_id: str
    name: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    pages: list[Any] = Field(default_factory=list)
    methodology_meta: dict[str, Any] | None = None
    anonymous: bool = True


class UpdateSurveyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    pages: list[Any] = Field(default_factory=list)
    methodology_meta: dict[str, Any] | None = None
    anonymous: bool = True
    closes_at: datetime | None = None


class SurveyStatusRequest(BaseModel):
    status: Literal["draft", "open", "closed"]


class SurveyListItem(BaseModel):
    id: str
    name: str
    description: str
    status: SurveyStatus
    organization_id: str
    author: PublicAuthorResponse | None
    category_id: str | None = None
    category_name: str | None = None
    methodology_names: list[str] = Field(default_factory=list)
    questions_count: int = 0
    responses_count: int = 0
    last_response_at: str | None = None
    public_token: str
    created_at: str
    updated_at: str


class SurveyDetail(SurveyListItem):
    pages: list[Any]
    anonymous: bool
    closes_at: str | None = None
    methodology_meta: dict[str, Any] | None = None
    methodology_summary: MethodologySummary | None = None


class SurveysCounts(BaseModel):
    all: int
    mine: int
    open: int
    draft: int
    closed: int
    archived: int


# ─── AI builder ───────────────────────────────────────────────────────────────


class SurveyAiChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)


class SurveyAiBuildRequest(BaseModel):
    messages: list[SurveyAiChatMessage] = Field(..., min_length=1, max_length=40)
    title: str = ""
    pages: list[Any] = Field(default_factory=list)
    # Existing methodology meta (when refining a generated survey)
    methodology_meta: dict[str, Any] | None = None
    # Explicit methodology set chosen by the user — skips the automatic selection
    methodology_ids: list[str] | None = None


class SurveyAiBuildResponse(BaseModel):
    reply: str
    title: str | None = None
    pages: list[dict[str, Any]] | None = None
    methodology_meta: dict[str, Any] | None = None
    methodology_summary: MethodologySummary | None = None


# ─── Public / respondent ──────────────────────────────────────────────────────


class PublicSurveyResponse(BaseModel):
    name: str
    description: str
    pages: list[Any]
    organization_name: str | None = None
    anonymous: bool = True


class SubmitSurveyRequest(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)
    duration_seconds: int | None = Field(default=None, ge=0, le=86400 * 7)


class SurveySubmittedResponse(BaseModel):
    id: str


# ─── Responses (results) ──────────────────────────────────────────────────────


class SurveyResponseItem(BaseModel):
    id: str
    submitted_at: str
    duration_seconds: int | None = None
    quality_flags: dict[str, Any] | None = None
    answers: dict[str, Any]


class SurveyResponsesPage(BaseModel):
    total: int
    flagged: int
    items: list[SurveyResponseItem]


class QuestionOptionStat(BaseModel):
    label: str
    count: int
    percent: float


class ScaleBucket(BaseModel):
    value: float
    count: int


class QuestionStat(BaseModel):
    field_id: str
    label: str
    type: str
    methodology: str | None = None
    kind: Literal["choice", "scale", "text"]
    answered: int = 0
    options: list[QuestionOptionStat] = Field(default_factory=list)
    mean: float | None = None
    median: float | None = None
    mode: float | None = None
    std: float | None = None
    distribution: list[ScaleBucket] = Field(default_factory=list)
    samples: list[str] = Field(default_factory=list)


class MetricResult(BaseModel):
    id: str
    name: str
    value: float
    unit: str
    n: int
    details: dict[str, float] = Field(default_factory=dict)
    interpretation: str = ""


class SurveyResults(BaseModel):
    total: int
    used: int
    excluded: int
    exclude_flagged: bool
    median_duration_seconds: int | None = None
    mean_duration_seconds: int | None = None
    # Average share of answered questions per response, % (how completely people answer)
    completion_rate: float | None = None
    first_response_at: str | None = None
    last_response_at: str | None = None
    metrics: list[MetricResult] = Field(default_factory=list)
    questions: list[QuestionStat] = Field(default_factory=list)


class SurveyAiSummary(BaseModel):
    bullets: list[str]
    generated_at: str
    responses_used: int
    exclude_flagged: bool
    # The number of responses changed since the summary was generated
    stale: bool = False


class SurveyAiSummaryRequest(BaseModel):
    exclude_flagged: bool = True
    force: bool = False


class SurveyAiAnalysisChatRequest(BaseModel):
    messages: list[SurveyAiChatMessage] = Field(..., min_length=1, max_length=20)
    exclude_flagged: bool = True


class SurveyAiQuote(BaseModel):
    text: str
    question: str


class CrosstabGroup(BaseModel):
    label: str
    n: int
    mean: float | None = None
    median: float | None = None
    std: float | None = None


class CrosstabResult(BaseModel):
    # "table": counts of two categorical questions (+ chi-square);
    # "means": a numeric question broken down by the groups of a categorical one
    kind: Literal["table", "means"]
    row_field_id: str
    row_label: str
    col_field_id: str
    col_label: str
    n: int = 0
    row_labels: list[str] = Field(default_factory=list)
    col_labels: list[str] = Field(default_factory=list)
    counts: list[list[int]] = Field(default_factory=list)
    row_percent: list[list[float]] = Field(default_factory=list)
    chi2: float | None = None
    dof: int | None = None
    p_value: float | None = None
    cramers_v: float | None = None
    low_expected_share: float | None = None
    note: str | None = None
    groups: list[CrosstabGroup] = Field(default_factory=list)


class SurveyAiAnalysisChatResponse(BaseModel):
    reply: str
    quotes: list[SurveyAiQuote] = Field(default_factory=list)
    crosstab: CrosstabResult | None = None
