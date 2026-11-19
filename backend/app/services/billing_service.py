"""Plans, subscriptions and what a user is entitled to.

Nothing here commits: the caller owns the transaction. Creating the subscription is idempotent,
so a request that never commits just repeats it next time.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import (
    AI_LIFETIME_ANCHOR,
    AI_WINDOW_LIFETIME,
    AI_WINDOW_MONTH,
    INTERVAL_NONE,
    METRIC_AI_TOKENS,
    METRIC_RESPONSES,
    ADDON_DAYS,
    ADDON_PRICE_KOPECKS,
    ADDON_TOKENS,
    PACK,
    PACK_DAYS,
    PACK_PRICE_KOPECKS,
    PERIOD_DAYS,
    PLAN_PACK,
    PLAN_RESEARCHER,
    PLAN_START,
    PLANS,
    STATUS_ACTIVE,
    STATUS_EXPIRED,
    STATUS_PAST_DUE,
    STATUS_TRIALING,
    UNLIMITED,
    Plan,
    apply_overrides,
    get_plan,
    seat_model_plan,
)
from app.constants.team_roles import SEATS_UNLIMITED
from app.core.config import settings
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories import (
    billing_repository,
    plan_request_repository,
    survey_repository,
    token_grant_repository,
)
from app.schemas.billing import (
    PlanInfo,
    PlanLimits,
    PlanRequestInfo,
    PlansResponse,
    QuoteLine,
    QuoteResponse,
    SubscriptionResponse,
    SubscriptionUsage,
    UsageMetric,
)
from app.services import pricing, seat_window

EVENT_CREATED = "created"
EVENT_RESPONSES_UNLOCKED = "responses_unlocked"

_PERIOD = timedelta(days=PERIOD_DAYS)


@dataclass(frozen=True)
class Entitlements:
    """What the user may do right now. Every other module asks for this and never reads statuses."""

    # Limits already include the administrator's per-user overrides
    plan: Plan
    status: str
    billing_interval: str
    period_start: datetime
    period_end: datetime
    trial_ends_at: datetime | None
    trial_used: bool
    cancel_at_period_end: bool
    billing_enabled: bool
    # The span the plan's AI tokens are counted over; the end is None for the free allowance, which
    # is given once and never renewed
    ai_window_start: datetime
    ai_window_end: datetime | None
    # Paid places of the team: owner, admins and editors. The free plan and the pack are one person
    seats: int = 1
    # End of the one-time 7-day window for a kit place after the first payment (None: no window)
    seat_window_ends_at: datetime | None = None


def free_window(anchor: datetime, now: datetime) -> tuple[datetime, datetime]:
    """The 30-day window that contains `now`, counted from `anchor`."""
    steps = max((now - anchor) // _PERIOD, 0)
    start = anchor + steps * _PERIOD
    return start, start + _PERIOD


def ai_window(
    plan: Plan, period_start: datetime, period_end: datetime, now: datetime
) -> tuple[datetime, datetime | None]:
    """The span the plan's AI tokens are counted over (usage counters are keyed by its start)."""
    if plan.ai_window == AI_WINDOW_LIFETIME:
        return AI_LIFETIME_ANCHOR, None
    if plan.ai_window == AI_WINDOW_MONTH:
        # A yearly subscription still gets its tokens back every 30 days
        start, end = free_window(period_start, now)
        return start, min(end, period_end)
    return period_start, period_end


# The owner is warned when this share of a monthly limit is used
LIMIT_WARNING_SHARE = 0.8
_MIN_LIMIT_TO_WARN = 5


def warning_threshold(limit: int) -> int | None:
    """The usage at which the owner is warned (80 % of the limit); None for a limit too small for it."""
    if limit < _MIN_LIMIT_TO_WARN:
        return None
    return math.ceil(limit * LIMIT_WARNING_SHARE)


def effective_plan_code(sub: Subscription, now: datetime, grace_days: int) -> str:
    """The plan that really applies: a paid plan only while it is paid for, otherwise the free one."""
    code = get_plan(sub.plan_code).code
    if code == PLAN_START:
        return PLAN_START
    if sub.status == STATUS_ACTIVE and now < sub.current_period_end:
        return code
    if sub.status == STATUS_TRIALING and sub.trial_ends_at is not None and now < sub.trial_ends_at:
        return code
    if sub.status == STATUS_PAST_DUE and now < sub.current_period_end + timedelta(days=grace_days):
        return code
    return PLAN_START


def _current_period(
    sub: Subscription, stored_code: str, downgraded: bool, now: datetime
) -> tuple[datetime, datetime]:
    if downgraded:
        # A paid plan that ran out: the free window starts at the moment access ended
        return free_window(sub.current_period_end, now)
    if stored_code == PLAN_START:
        return free_window(sub.current_period_start, now)
    return sub.current_period_start, sub.current_period_end


def resolve_entitlements(sub: Subscription, now: datetime, grace_days: int) -> Entitlements:
    """Pure: the stored subscription plus the clock give the rights."""
    stored = get_plan(sub.plan_code)
    code = effective_plan_code(sub, now, grace_days)
    downgraded = code != stored.code
    plan = get_plan(code)
    seats = max(1, sub.seats_count or 1) if plan.code == PLAN_RESEARCHER else 1
    if not downgraded:
        if settings.SEAT_PRICING_ENABLED:
            # The quota of the seat model comes first, so that an override of the administrator wins
            plan = seat_model_plan(plan, seats, trialing=sub.status == STATUS_TRIALING)
        # The overrides were granted together with the plan; they go away when it does
        plan = apply_overrides(plan, sub.limit_overrides)
    period_start, period_end = _current_period(sub, stored.code, downgraded, now)
    ai_start, ai_end = ai_window(plan, period_start, period_end, now)
    return Entitlements(
        plan=plan,
        status=STATUS_EXPIRED if downgraded else sub.status,
        billing_interval=INTERVAL_NONE if downgraded else sub.billing_interval,
        period_start=period_start,
        period_end=period_end,
        trial_ends_at=sub.trial_ends_at,
        trial_used=sub.trial_used_at is not None,
        cancel_at_period_end=sub.cancel_at_period_end,
        billing_enabled=True,
        ai_window_start=ai_start,
        ai_window_end=ai_end,
        seats=seats,
        seat_window_ends_at=sub.seat_window_ends_at if plan.code == PLAN_RESEARCHER else None,
    )


def unlimited_entitlements(now: datetime) -> Entitlements:
    """Billing is switched off: nobody is limited, as before billing existed."""
    return Entitlements(
        plan=UNLIMITED,
        status=STATUS_ACTIVE,
        billing_interval=INTERVAL_NONE,
        period_start=now,
        period_end=now + _PERIOD,
        trial_ends_at=None,
        trial_used=False,
        cancel_at_period_end=False,
        billing_enabled=False,
        ai_window_start=now,
        ai_window_end=None,
        seats=SEATS_UNLIMITED,
    )


def _team_model() -> bool:
    return settings.BILLING_ENABLED and settings.TEAM_BILLING_ENABLED


# The team model: which offer lifts what, and how it is said (docs/MONETIZATION_TEAM_SPEC.md, section 3)
_TEAM_NEXT_PLAN = {PLAN_START: "plus", PLAN_PACK: "plus", "plus": "pro"}
_TEAM_FEATURE_TEXT = {
    "csv_export": (
        "pack",
        "Выгрузка ответов в CSV открывается навсегда после покупки пакета за 99 ₽ или на тарифах Plus и Pro.",
    ),
    "methodology": (
        "pack",
        "Все методики открываются навсегда после покупки пакета за 99 ₽ или на тарифах Plus и Pro.",
    ),
    "crosstabs": ("plus", "Сравнение групп доступно на тарифах Plus и Pro."),
    "quality_filter": ("plus", "Фильтр некачественных ответов доступен на тарифах Plus и Pro."),
}


def _team_limit_detail(ent: Entitlements, limit: str, maximum: int) -> dict[str, object]:
    """What the window says about a limit of the team model, with the offer that lifts it."""
    upgrade = _TEAM_NEXT_PLAN.get(ent.plan.code)
    if limit == "seats":
        message = (
            f"В тарифе команды {maximum} мест с учётом владельца, все заняты. Читателей можно приглашать сверх лимита."
            + (" Больше мест — на тарифе Pro." if upgrade == "pro" else " Больше мест — на тарифах Plus и Pro." if upgrade else "")
        )
    elif limit == "ai_member_tokens":
        message = "Ваш личный лимит Токенов+ в этой команде исчерпан. Попросите владельца команды увеличить его."
        upgrade = None
    elif limit == "readers":
        message = f"В команде уже {maximum} читателей, это предел."
        upgrade = None
    else:
        message = "Лимит тарифа команды исчерпан."
    return {"upgrade_to": upgrade, "message": message}


def limit_reached_error(
    ent: Entitlements, limit: str, used: int, maximum: int
) -> HTTPException:
    """402 in the one format the interface turns into the "choose a plan" window."""
    if _team_model():
        return HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "limit_reached",
                "limit": limit,
                "used": used,
                "max": maximum,
                "plan": ent.plan.code,
                "resets_at": ent.period_end.isoformat(),
                **_team_limit_detail(ent, limit, maximum),
            },
        )
    return HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail={
            "code": "limit_reached",
            "limit": limit,
            "used": used,
            "max": maximum,
            "plan": ent.plan.code,
            "upgrade_to": PLAN_RESEARCHER if ent.plan.code != PLAN_RESEARCHER else None,
            "resets_at": ent.period_end.isoformat(),
        },
    )


def feature_locked_error(ent: Entitlements, feature: str, **extra: object) -> HTTPException:
    """402 for something the plan does not include, in the same envelope as limit_reached."""
    if _team_model():
        upgrade, message = _TEAM_FEATURE_TEXT.get(
            feature, ("plus", "Эта возможность доступна на тарифах Plus и Pro.")
        )
        return HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "limit_reached",
                "limit": "feature",
                "feature": feature,
                **extra,
                "plan": ent.plan.code,
                "upgrade_to": upgrade,
                "message": message,
                "resets_at": ent.period_end.isoformat(),
            },
        )
    return HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail={
            "code": "limit_reached",
            "limit": "feature",
            "feature": feature,
            **extra,
            "plan": ent.plan.code,
            "upgrade_to": PLAN_RESEARCHER if ent.plan.code != PLAN_RESEARCHER else None,
            "resets_at": ent.period_end.isoformat(),
        },
    )


async def ensure_subscription(
    session: AsyncSession, user_id: uuid.UUID, now: datetime | None = None
) -> Subscription:
    """The user's subscription; the free one is created on first use (no commit)."""
    now = now or datetime.now(timezone.utc)
    sub = await billing_repository.get_subscription(session, user_id)
    if sub is None:
        created_id = await billing_repository.create_subscription_if_missing(
            session,
            user_id=user_id,
            plan_code=PLAN_START,
            status=STATUS_ACTIVE,
            billing_interval=INTERVAL_NONE,
            period_start=now,
            period_end=now + _PERIOD,
            now=now,
        )
        sub = await billing_repository.get_subscription(session, user_id)
        if created_id is not None:
            await billing_repository.add_event(
                session,
                subscription_id=created_id,
                kind=EVENT_CREATED,
                payload={"plan": PLAN_START},
            )
    if sub.plan_code == PLAN_START:
        # The free window moves forward on its own; usage counters are keyed by its start
        start, end = free_window(sub.current_period_start, now)
        if start != sub.current_period_start:
            sub.current_period_start, sub.current_period_end = start, end
            await session.flush()
    return sub


async def unlock_responses(
    session: AsyncSession, user_id: uuid.UUID, *, actor_user_id: uuid.UUID | None = None
) -> int:
    """Open the responses the quota kept back, after the plan or its limits grew (no commit).

    To be called on every upgrade: a manual grant, an approved plan request, a payment. Opens all
    of the owner's locked responses at once: paying gives access to everything already collected
    (what is analysed is still limited by the plan). Returns how many were opened.
    """
    opened = await survey_repository.unlock_responses_for_owner(session, user_id)
    if opened:
        sub = await ensure_subscription(session, user_id)
        await billing_repository.add_event(
            session,
            subscription_id=sub.id,
            kind=EVENT_RESPONSES_UNLOCKED,
            payload={"count": opened},
            actor_user_id=actor_user_id,
        )
    return opened


async def get_entitlements(
    session: AsyncSession, user_id: uuid.UUID, now: datetime | None = None
) -> Entitlements:
    now = now or datetime.now(timezone.utc)
    if not settings.BILLING_ENABLED:
        return unlimited_entitlements(now)
    sub = await ensure_subscription(session, user_id, now)
    return resolve_entitlements(sub, now, settings.BILLING_PAST_DUE_GRACE_DAYS)


def plan_info(plan: Plan) -> PlanInfo:
    return PlanInfo(
        code=plan.code,
        title=plan.title,
        price_month_kopecks=plan.price_month_kopecks,
        price_year_kopecks=plan.price_year_kopecks,
        limits=PlanLimits(
            max_active_surveys=plan.max_active_surveys,
            max_projects=plan.max_projects,
            max_questions=plan.max_questions,
            responses_per_period=plan.responses_per_period,
            max_analyzed_responses=plan.max_analyzed_responses,
            ai_tokens_per_period=plan.ai_tokens_per_period,
        ),
        features=sorted(plan.features),
    )


def build_plans_response() -> PlansResponse:
    def shown(plan: Plan) -> Plan:
        # With the seat model the public numbers are the quota of one seat and of the pack
        return seat_model_plan(plan) if settings.SEAT_PRICING_ENABLED else plan

    return PlansResponse(
        # The one-off pack is not a subscription: it is described by the pack_* fields
        plans=[plan_info(shown(plan)) for plan in PLANS.values() if plan.code != PLAN_PACK],
        payments_enabled=settings.payments_enabled,
        pack=plan_info(shown(PACK)),
        pack_price_kopecks=PACK_PRICE_KOPECKS,
        pack_days=PACK_DAYS,
        seat_pricing_enabled=settings.SEAT_PRICING_ENABLED,
        max_seats=pricing.MAX_SELF_SERVICE_SEATS,
        addon_price_kopecks=ADDON_PRICE_KOPECKS,
        addon_tokens=ADDON_TOKENS,
        addon_days=ADDON_DAYS,
    )


def build_quote_response(term: str, seats: int, kit_extra: int = pricing.KIT_EXTRA_SEATS) -> QuoteResponse:
    """The price of a team for a period; the same calculator the payment uses. ValueError on a bad input."""
    quote = pricing.quote(seats, term, kit_extra=kit_extra)
    return QuoteResponse(
        term=term,
        seats=quote.seats,
        lines=[QuoteLine(kind=line.kind, kopecks=line.price_kopecks) for line in quote.lines],
        subtotal_kopecks=quote.subtotal_kopecks,
        total_kopecks=quote.total_kopecks,
        year_saving_kopecks=quote.year_saving_kopecks,
    )


# What of the subscription journal the person is told, and which fields of each event they may see.
# Notes (they carry payment ids), administrators' ids and everything else stay out.
_HISTORY_FIELDS: dict[str, tuple[str, ...]] = {
    "trial_started": ("ends_at",),
    "manual_grant": ("plan", "until", "extended"),
    "seats_added": ("from", "to"),
    "refund_revoked": ("plan", "result", "period_end", "seats_from", "seats_to"),
    "expired": ("from_plan", "reason"),
    "canceled": ("period_end",),
    "resumed": (),
}
HISTORY_LIMIT = 30


def history_item(kind: str, created_at: datetime, payload: dict | None):
    """One journal event in the shape the person sees, or None for a kind that is not theirs to see."""
    fields = _HISTORY_FIELDS.get(kind)
    if fields is None:
        return None
    from app.schemas.billing import SubscriptionHistoryItem

    details: dict[str, str | int | None] = {}
    for name in fields:
        value = (payload or {}).get(name)
        if isinstance(value, bool):
            value = int(value)
        if value is None or isinstance(value, (str, int)):
            details[name] = value
    return SubscriptionHistoryItem(kind=kind, created_at=created_at, details=details)


async def get_history(session: AsyncSession, user: User) -> list:
    """The newest things that happened to the person's plan: payments applied, seats, expiry, refunds."""
    sub = await billing_repository.get_subscription(session, user.id)
    if sub is None:
        return []
    events = await billing_repository.list_events(session, sub.id, limit=HISTORY_LIMIT * 2)
    items = [history_item(e.kind, e.created_at, e.payload) for e in events]
    return [item for item in items if item is not None][:HISTORY_LIMIT]


async def get_subscription_summary(session: AsyncSession, user: User) -> SubscriptionResponse:
    """Plan, period and usage for the profile page. Commits: it may have created the subscription."""
    ent = await get_entitlements(session, user.id)
    used: dict[str, int] = {}
    open_surveys = projects = locked = 0
    pending = None
    ai_used = 0
    extra_tokens = 0
    if ent.billing_enabled:
        extra_tokens = await token_grant_repository.remaining(session, user.id, datetime.now(timezone.utc))
        used = await billing_repository.get_usage(session, user.id, ent.period_start)
        ai_used = (await billing_repository.get_usage(session, user.id, ent.ai_window_start)).get(
            METRIC_AI_TOKENS, 0
        )
        pending = await plan_request_repository.get_pending_for_user(session, user.id)
        open_surveys = await survey_repository.count_open_surveys_for_owner(session, user.id)
        projects = await survey_repository.count_projects_for_owner(session, user.id)
        locked = await survey_repository.count_locked_for_owner(session, user.id)
        await session.commit()
    scheduled = user.deletion_requested_at is not None
    return SubscriptionResponse(
        billing_enabled=ent.billing_enabled,
        enforced=ent.billing_enabled and settings.BILLING_ENFORCE,
        plan=plan_info(ent.plan),
        status=ent.status,
        billing_interval=ent.billing_interval,
        current_period_start=ent.period_start,
        current_period_end=ent.period_end,
        trial_ends_at=ent.trial_ends_at,
        trial_used=ent.trial_used,
        cancel_at_period_end=ent.cancel_at_period_end,
        deletion_scheduled=scheduled,
        deletion_at=ent.period_end if scheduled and ent.plan.code != PLAN_START else None,
        usage=SubscriptionUsage(
            ai_tokens=UsageMetric(
                used=ai_used, max=ent.plan.ai_tokens_per_period, resets_at=ent.ai_window_end
            ),
            responses=UsageMetric(
                used=used.get(METRIC_RESPONSES, 0), max=ent.plan.responses_per_period
            ),
            active_surveys=UsageMetric(used=open_surveys, max=ent.plan.max_active_surveys),
            projects=UsageMetric(used=projects, max=ent.plan.max_projects),
            locked_responses=locked,
            ai_extra_tokens=extra_tokens,
        ),
        plan_request=(
            PlanRequestInfo.model_validate(pending, from_attributes=True) if pending else None
        ),
        seats=ent.seats if ent.seats < SEATS_UNLIMITED else 1,
        seat_window_ends_at=ent.seat_window_ends_at,
        seat_window_days_left=seat_window.days_left(ent, datetime.now(timezone.utc)),
    )
