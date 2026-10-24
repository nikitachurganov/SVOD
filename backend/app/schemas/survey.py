from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

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


# ─── Projects ─────────────────────────────────────────────────────────────────


# Keys of the folder palette; the shades themselves live in the client, per theme
FOLDER_COLORS = ("orange", "violet", "blue", "green", "red", "pink", "indigo", "gray")


class _ProjectFields(BaseModel):
    name: str = Field(..., max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    color: str | None = None

    @field_validator("color")
    @classmethod
    def _color_in_palette(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if value not in FOLDER_COLORS:
            raise ValueError("Неизвестный цвет папки")
        return value

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Укажите название проекта")
        return value

    @field_validator("description")
    @classmethod
    def _description_blank_is_none(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        return value or None


class CreateProjectRequest(_ProjectFields):
    organization_id: str


class UpdateProjectRequest(_ProjectFields):
    pass


class SurveyProjectItem(BaseModel):
    id: str
    organization_id: str
    name: str
    description: str | None = None
    color: str | None = None
    # Without archived surveys — the same set the project's table shows by default
    surveys_count: int = 0
    created_at: str
    updated_at: str


class MoveSurveyRequest(BaseModel):
    project_id: str


# ─── Survey CRUD ──────────────────────────────────────────────────────────────


class CreateSurveyRequest(BaseModel):
    organization_id: str
    # Without it the survey goes to the organization's default project
    project_id: str | None = None
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
    project_id: str
    project_name: str
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


QualityStatus = Literal["ok", "review", "flagged"]


class QualityReasonOut(BaseModel):
    """Why a response got a remark: a machine code plus words for the researcher"""

    code: str
    severity: Literal["strong", "weak"]
    title: str
    explanation: str
    # Questions the reason is about (empty when it concerns the response as a whole)
    field_ids: list[str] = Field(default_factory=list)


class ResponsePreview(BaseModel):
    """A short piece of a response for the list: a quote from a text answer or one short answer"""

    label: str
    text: str
    kind: Literal["text", "value"]


class SurveyResponseItem(BaseModel):
    id: str
    # Ordinal of the response in the order of arrival: "Ответ №12"
    number: int = 0
    submitted_at: str
    duration_seconds: int | None = None
    quality_flags: dict[str, Any] | None = None
    # ok — no remarks; review — only weak signals; flagged — a strong signal (left out of analytics)
    quality_status: QualityStatus = "ok"
    answers: dict[str, Any]
    preview: list[ResponsePreview] = Field(default_factory=list)


class SurveyResponsesPage(BaseModel):
    total: int
    flagged: int
    items: list[SurveyResponseItem]


class SurveyQuestionOption(BaseModel):
    id: str
    label: str


class SurveyQuestion(BaseModel):
    """A question as the respondent saw it (taken from the form snapshot of the response)"""

    id: str
    type: str
    label: str
    options: list[SurveyQuestionOption] = Field(default_factory=list)
    methodology: str | None = None


class SurveyResponseDetail(BaseModel):
    id: str
    number: int
    total: int
    submitted_at: str
    duration_seconds: int | None = None
    quality_flags: dict[str, Any] | None = None
    quality_status: QualityStatus = "ok"
    quality_reasons: list[QualityReasonOut] = Field(default_factory=list)
    answers: dict[str, Any]
    # Questions in the order of the form the respondent filled in
    questions: list[SurveyQuestion]
    # Neighbours by time of arrival: the previous (older) and the next (newer) response
    prev_id: str | None = None
    next_id: str | None = None


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


class ResponsesDay(BaseModel):
    date: str  # YYYY-MM-DD, UTC
    count: int


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
    responses_by_day: list[ResponsesDay] = Field(default_factory=list)
    metrics: list[MetricResult] = Field(default_factory=list)
    questions: list[QuestionStat] = Field(default_factory=list)


class QuestionAnswerItem(BaseModel):
    response_id: str
    number: int
    submitted_at: str
    text: str


class QuestionAnswersPage(BaseModel):
    """Every answer given to one open question, newest first"""

    field_id: str
    label: str
    total: int
    items: list[QuestionAnswerItem]


class SurveyAiSummary(BaseModel):
    bullets: list[str]
    # Per bullet: ids of the questions whose figures it rests on (to jump to the data)
    evidence: list[list[str]] = Field(default_factory=list)
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
