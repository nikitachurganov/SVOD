import uuid
from datetime import datetime
from typing import Literal

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
    # True: the Researcher plan is sold by seats (the price page shows the configurator and the
    # numbers of `limits` are per seat); False: one price per person
    seat_pricing_enabled: bool = False
    max_seats: int = 10
    # The extra pack of Токены+ bought on top of a running plan
    addon_price_kopecks: int = 0
    addon_tokens: int = 0
    addon_days: int = 0
    # The team model (docs/MONETIZATION_TEAM_SPEC.md): the price page shows these offers instead
    team_billing_enabled: bool = False
    team_offers: list["TeamOfferInfo"] = Field(default_factory=list)
    team_free_tokens: int = 0
    # The strong models a team with Токены+ may pick (the base model is always there)
    team_strong_models: list[str] = Field(default_factory=list)


class QuoteLine(BaseModel):
    # creator, kit or other (docs/TARIFFS_FINAL.md §4.2)
    kind: str
    kopecks: int


class QuoteResponse(BaseModel):
    """What a team of ``seats`` seats pays for one period, from the same calculator as the payment."""

    term: str
    seats: int
    lines: list[QuoteLine]
    subtotal_kopecks: int
    total_kopecks: int
    # What a year saves against twelve months, in kopecks
    year_saving_kopecks: int


class SeatAdditionQuoteResponse(BaseModel):
    """What the extra seats cost for the rest of the paid period."""

    seats: int
    amount_kopecks: int
    days_left: int


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
    # Токены+ left in the extra packs; they are spent after the quota of the period
    ai_extra_tokens: int = 0


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
    # Seats of the team to pay for; more than one only while SEAT_PRICING_ENABLED is on
    seats: int = Field(default=1, ge=1, le=100)
    # The page the person comes back to from the provider: a team's people or the plans
    return_to: Literal["participants", "plans"] | None = None


class SeatsRequest(BaseModel):
    # How many seats the team should have after the extra payment
    seats: int = Field(ge=2, le=100)
    return_to: Literal["participants", "plans"] | None = None


class CheckoutResponse(BaseModel):
    payment_id: uuid.UUID
    # The payment page of the provider the person is sent to
    confirmation_url: str


class PaymentInfo(BaseModel):
    id: uuid.UUID
    # What the payment was for: the plan, how it was paid (month, year, one_off, seats_add, addon),
    # how many seats and how many days it gave
    plan_code: str
    term: str
    seats: int
    days: int
    amount_kopecks: int
    # new, pending, succeeded, canceled, failed or mismatch
    status: str
    created_at: datetime
    paid_at: datetime | None
    refunded_kopecks: int
    is_test: bool


class SubscriptionHistoryItem(BaseModel):
    """One thing that happened to the person's plan, in the words the person can be told."""

    kind: str
    created_at: datetime
    # Only the fields that are meant for the person (plan, dates, seats); never notes or payment ids
    details: dict[str, str | int | None] = {}


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
    # Paid seats of the team and the 7-day window after the first payment (docs/TARIFFS_FINAL.md §4.3)
    seats: int = 1
    seat_window_ends_at: datetime | None = None
    seat_window_days_left: int = 0


# ─── The team model (docs/MONETIZATION_TEAM_SPEC.md) ──────────────────────────


class TeamBalanceInfo(BaseModel):
    """One balance of the team: what is left, the full quota and when it is renewed (None: never)."""

    remaining: int
    quota: int
    resets_at: datetime | None = None


class TeamOfferInfo(BaseModel):
    kind: str
    title: str
    price_kopecks: int
    tokens: int
    # Seats with the owner; 0 for the pack, which adds none
    seats: int
    # A paid month in days; None for the pack, which has no term
    days: int | None = None
    # False when it cannot be bought now (a different subscription is running)
    available: bool = True


class TeamBillingSummary(BaseModel):
    organization_id: uuid.UUID
    # The running subscription, None without one
    plan_code: str | None = None
    plan_title: str | None = None
    period_end: datetime | None = None
    seats: int
    # The quota of the paid month (until period_end) and the packs with no expiry, shown apart
    subscription: TeamBalanceInfo | None = None
    purchased_tokens: int
    # The free ordinary tokens; used only while the team has no Токены+
    free: TeamBalanceInfo
    # "paid" (Токены+, a model can be chosen), "free" (the base model) or "suspended" (a paid month
    # with both balances at zero: the AI waits for a pack or the next quota)
    ai_mode: str
    models: list[str]
    features: list[str]
    permanent_tools: bool
    can_buy: bool
    # True: the limits block (BILLING_ENFORCE); False: the shadow mode, an empty balance stops nothing
    enforced: bool = False
    offers: list[TeamOfferInfo]


class TeamCheckoutRequest(BaseModel):
    # "pack", or the code of a team plan
    kind: str
    return_to: str | None = None


class TeamPaymentInfo(BaseModel):
    id: uuid.UUID
    plan_code: str
    amount_kopecks: int
    status: str
    created_at: datetime
    paid_at: datetime | None = None
    refunded_kopecks: int = 0

    model_config = {"from_attributes": True}


# PlansResponse names TeamOfferInfo before it is defined
PlansResponse.model_rebuild()
