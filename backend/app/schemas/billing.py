import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.constants.billing_plans import INTERVAL_MONTH, PLAN_RESEARCHER


class PlanLimits(BaseModel):
    max_active_surveys: int
    max_projects: int
    max_questions: int
    responses_per_period: int
    max_analyzed_responses: int
    # AI allowance in tokens (prompt + completion)
    ai_tokens_per_period: int


class PlanInfo(BaseModel):
    code: str
    title: str
    price_month_kopecks: int
    price_year_kopecks: int
    limits: PlanLimits
    features: list[str]


class PlansResponse(BaseModel):
    plans: list[PlanInfo]
    # True: the person can pay online; False: only a request for an invoice is offered
    payments_enabled: bool = False
    # One-off pack: a fixed allowance of AI tokens for a fixed number of days, no auto-renewal
    pack: PlanInfo
    pack_price_kopecks: int
    pack_days: int


class UsageMetric(BaseModel):
    used: int
    max: int
    # When the counter starts over; None for what is never renewed
    resets_at: datetime | None = None


class SubscriptionUsage(BaseModel):
    ai_tokens: UsageMetric
    responses: UsageMetric
    active_surveys: UsageMetric
    projects: UsageMetric
    # Responses received beyond the quota and kept back until the plan grows
    locked_responses: int


class PlanRequestCreate(BaseModel):
    """A request for a paid plan that an administrator activates after the payment."""

    plan_code: str = PLAN_RESEARCHER
    # month or year for the Researcher plan, one_off for the pack
    billing_interval: str = INTERVAL_MONTH
    # How to reach the person about the payment: an email or a messenger handle
    contact: str = Field(min_length=3, max_length=200)
    comment: str | None = Field(default=None, max_length=1000)

    @field_validator("contact")
    @classmethod
    def _strip_contact(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Укажите, как с вами связаться")
        return value

    @field_validator("comment")
    @classmethod
    def _strip_comment(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class CheckoutRequest(BaseModel):
    # month or year (Researcher), one_off (the pack)
    term: str = INTERVAL_MONTH


class CheckoutResponse(BaseModel):
    payment_id: uuid.UUID
    # The payment page of the provider the person is sent to
    confirmation_url: str


class PaymentInfo(BaseModel):
    id: uuid.UUID
    term: str
    amount_kopecks: int
    # new, pending, succeeded, canceled, failed or mismatch
    status: str
    created_at: datetime
    paid_at: datetime | None
    refunded_kopecks: int
    is_test: bool


class PlanRequestInfo(BaseModel):
    id: uuid.UUID
    plan_code: str
    billing_interval: str
    status: str
    created_at: datetime


class SubscriptionResponse(BaseModel):
    # False: billing is switched off and the plan below is the "no limits" stand-in
    billing_enabled: bool
    # False in shadow mode: usage is counted, nothing is blocked
    enforced: bool
    plan: PlanInfo
    status: str
    billing_interval: str
    current_period_start: datetime
    current_period_end: datetime
    trial_ends_at: datetime | None
    trial_used: bool
    cancel_at_period_end: bool
    # The account is to be deleted when the paid period ends; deletion_at is that moment
    deletion_scheduled: bool
    deletion_at: datetime | None
    usage: SubscriptionUsage
    # The request for a paid plan that waits for the administrator, if there is one
    plan_request: PlanRequestInfo | None = None
