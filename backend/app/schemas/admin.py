import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.schemas.billing import PlanLimits, UsageMetric


class AdminUserRow(BaseModel):
    """One line of the user table. The password hash and tokens never get here."""

    id: uuid.UUID
    first_name: str
    last_name: str
    middle_name: str | None
    email: str
    phone_number: str
    email_verified: bool
    created_at: datetime
    last_login_at: datetime | None
    is_active: bool
    ai_enabled: bool
    role: str
    plan_code: str
    plan_title: str
    # Plan status as it really applies now: active, trialing, past_due or expired
    subscription_status: str
    plan_ends_at: datetime | None
    ai_actions_used: int
    ai_actions_max: int
    surveys_count: int
    responses_count: int
    deletion_requested_at: datetime | None


class AdminUserList(BaseModel):
    items: list[AdminUserRow]
    total: int
    page: int
    page_size: int


class AdminLimits(PlanLimits):
    # The AI spending cap of one period, in roubles
    ai_budget_rub_per_period: int


class AdminSubscription(BaseModel):
    plan_code: str
    plan_title: str
    status: str
    billing_interval: str
    current_period_start: datetime
    current_period_end: datetime
    trial_ends_at: datetime | None
    trial_used: bool
    cancel_at_period_end: bool
    # What the administrator set for this person on top of the plan
    limit_overrides: dict[str, int] | None
    # The limits that apply now (the plan with the overrides)
    limits: AdminLimits


class AdminUsage(BaseModel):
    ai_actions: UsageMetric
    responses: UsageMetric
    active_surveys: UsageMetric
    projects: UsageMetric
    locked_responses: int
    # Real AI spending of the last 30 days, in dollars
    ai_cost_usd_30d: float


class AdminEvent(BaseModel):
    id: uuid.UUID
    kind: str
    payload: dict[str, Any] | None
    actor_user_id: uuid.UUID | None
    actor_email: str | None
    created_at: datetime


class AdminAiLogRow(BaseModel):
    id: uuid.UUID
    action: str
    calls: int
    model: str | None
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float | None
    status: str
    survey_id: uuid.UUID | None
    created_at: datetime


class AdminPlanRequest(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_name: str
    plan_code: str
    billing_interval: str
    contact: str
    comment: str | None
    status: str
    created_at: datetime
    processed_at: datetime | None
    decision_note: str | None


class AdminPlanRequestList(BaseModel):
    items: list[AdminPlanRequest]
    total: int
    page: int
    page_size: int


class AdminPayment(BaseModel):
    id: uuid.UUID
    term: str
    amount_kopecks: int
    status: str
    # The id in the YooKassa cabinet, to find the payment there
    provider_payment_id: str | None
    created_at: datetime
    paid_at: datetime | None
    refunded_kopecks: int
    failure_reason: str | None
    is_test: bool


class AdminUserDetail(BaseModel):
    user: AdminUserRow
    subscription: AdminSubscription
    usage: AdminUsage
    events: list[AdminEvent]
    ai_usage: list[AdminAiLogRow]
    plan_requests: list[AdminPlanRequest]
    payments: list[AdminPayment] = []


class AdminUserPatch(BaseModel):
    is_active: bool | None = None
    ai_enabled: bool | None = None


class AdminGrantRequest(BaseModel):
    """Give a paid plan: for a term in days or until a date, optionally with personal limits."""

    plan: str = "researcher"
    days: int | None = Field(default=None, ge=1, le=3650)
    until: datetime | None = None
    note: str | None = Field(default=None, max_length=500)
    limit_overrides: dict[str, int] | None = None

    @field_validator("note")
    @classmethod
    def _strip_note(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class AdminApproveRequest(BaseModel):
    # Empty: the term follows the request (a month, a year or the one-off pack)
    days: int | None = Field(default=None, ge=1, le=3650)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class AdminRejectRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason")
    @classmethod
    def _strip_reason(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class AdminUserStats(BaseModel):
    total: int
    new_7d: int
    new_30d: int
    active_30d: int
    email_verified: int
    blocked: int


class AdminTierStats(BaseModel):
    free: int
    trial: int
    paid: int
    past_due: int


class AdminStats(BaseModel):
    users: AdminUserStats
    plans: AdminTierStats
    # Monthly income expected from the paid plans that run now (trials excluded), in kopecks;
    # a plan given by hand counts at the monthly price
    expected_monthly_revenue_kopecks: int
    # What was really paid online in the last 30 days, refunds taken off, in kopecks
    received_30d_kopecks: int = 0
    # AI spending of the last 30 days, in dollars and in roubles at the configured rate
    ai_cost_usd_30d: float
    ai_cost_rub_30d: float
    # The share of the expected revenue the AI takes; None while there is no revenue
    ai_cost_share_of_revenue: float | None
    pending_plan_requests: int
