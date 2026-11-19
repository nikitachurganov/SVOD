"""The plan, the balances and the rights of a team (docs/MONETIZATION_TEAM_SPEC.md).

Everything here belongs to one team. A person who owns two teams buys for each of them apart, and the
surveys of a team spend that team's balances only.

Three balances:

* the free ordinary tokens (150 000 of the base model), renewed to exactly that on every monthly
  anniversary of the creation of the team;
* the quota of the paid month (2 or 6 million Токенов+), full at every payment, burning at the end of the
  month;
* the packs of 99 ₽ (500 000 Токенов+ each), with no expiry, kept when a subscription renews or ends.

A Токен+ is spent from the subscription first and from the packs after it. The free tokens are used only
while the team has no Токены+ at all: a paid month with both balances at zero stops the AI instead of
falling back to the free tokens.

The rights to all the methodologies and the CSV are the team's for good from its first pack; comparing
groups and the quality filter need a running subscription. Neither depends on a balance.

The pure functions come first and know nothing of the database; the ones below them spend and grant under
a lock on the row of the team, so parallel requests and a repeated payment cannot count twice.
"""

from __future__ import annotations

import calendar
import math
import uuid
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import (
    _PAID_FEATURES,
    FEATURE_ALL_METHODOLOGIES,
    FEATURE_CSV_EXPORT,
    INTERVAL_MONTH,
    INTERVAL_NONE,
    PLAN_PACK,
    PLAN_START,
    PLAN_TEAM_PACK,
    START,
    STATUS_ACTIVE,
    TEAM_BASE_MODEL_WEIGHT,
    TEAM_FREE_TOKENS,
    TEAM_PACK_PRICE_KOPECKS,
    TEAM_PACK_TOKENS,
    TEAM_PERIOD_DAYS,
    TEAM_PLANS,
    TEAM_STRONG_MODEL_WEIGHT,
    TEAM_UNSUBSCRIBED_SEATS,
    TeamPlan,
)
from app.core.config import settings
from app.core.metrics import BILLING_LIMIT_HIT
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.team_billing import TeamBilling
from app.schemas.billing import TeamBalanceInfo, TeamBillingSummary, TeamOfferInfo
from app.services import billing_service

AI_PAID = "paid"
AI_FREE = "free"
AI_SUSPENDED = "suspended"

# What a purchase is called in the API: a team plan code, or this
KIND_PACK = "pack"

_PERIOD = timedelta(days=TEAM_PERIOD_DAYS)
# The rights a pack opens for good
_PACK_FEATURES = frozenset({FEATURE_CSV_EXPORT, FEATURE_ALL_METHODOLOGIES})


# ─── Pure rules ───────────────────────────────────────────────────────────────


def add_months(anchor: datetime, months: int) -> datetime:
    """``anchor`` moved by whole calendar months; a day the month does not have becomes its last day.

    How the 29th to the 31st are treated is still open (spec, section 6, item 3): this is the common
    rule, and it is always counted from the original day, so a team made on the 31st renews on the 31st
    of every month that has one.
    """
    index = anchor.month - 1 + months
    year = anchor.year + index // 12
    month = index % 12 + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return anchor.replace(year=year, month=month, day=day)


def free_cycle(created_at: datetime, now: datetime) -> tuple[datetime, datetime]:
    """The monthly cycle of the free tokens that contains ``now``: from one anniversary to the next.

    The first of the calendar month means nothing here: the cycles start on the day the team was made.
    """
    months = (now.year - created_at.year) * 12 + now.month - created_at.month
    if add_months(created_at, months) > now:
        months -= 1
    months = max(months, 0)
    return add_months(created_at, months), add_months(created_at, months + 1)


def is_base_model(model: str | None) -> bool:
    return model in (None, "", settings.OPENROUTER_MODEL)


def strong_models() -> tuple[str, ...]:
    """The strong models a team with Токены+ may pick, from AI_STRONG_MODELS."""
    names = (m.strip() for m in settings.AI_STRONG_MODELS.split(","))
    return tuple(dict.fromkeys(m for m in names if m and m != settings.OPENROUTER_MODEL))


def charge_for(tokens: int, model: str | None, mode: str) -> int:
    """What an action costs: the free tokens one to one, Токены+ with the weight of the model.

    1 000 tokens of the base model are 200 Токенов+ and of a strong one 1 000. The result is rounded
    up, and a started action always costs at least one.
    """
    if tokens <= 0:
        return 0
    if mode == AI_FREE:
        return tokens
    weight = TEAM_BASE_MODEL_WEIGHT if is_base_model(model) else TEAM_STRONG_MODEL_WEIGHT
    # round() first: 5 * 0.2 is 1.0000000000000002 and must not become 2
    return max(1, math.ceil(round(tokens * weight, 6)))


def spend(plan_tokens: int, purchased: int, amount: int) -> tuple[int, int, int]:
    """(subscription left, packs left, really taken): the subscription goes first, nothing goes below 0."""
    amount = max(amount, 0)
    from_plan = min(max(plan_tokens, 0), amount)
    from_packs = min(max(purchased, 0), amount - from_plan)
    return plan_tokens - from_plan, purchased - from_packs, from_plan + from_packs


@dataclass(frozen=True)
class TeamState:
    """What the team has at a moment, with expired and renewed things already applied."""

    plan: TeamPlan | None
    period_start: datetime | None
    period_end: datetime | None
    # Zero without a running subscription: an ended month leaves nothing
    plan_tokens: int
    purchased_tokens: int
    free_tokens: int
    free_cycle_start: datetime
    free_cycle_end: datetime
    permanent_tools: bool

    @property
    def paid_tokens(self) -> int:
        return self.plan_tokens + self.purchased_tokens

    @property
    def ai_mode(self) -> str:
        if self.plan is not None:
            return AI_PAID if self.paid_tokens > 0 else AI_SUSPENDED
        # No subscription: the packs while they last, then the free tokens again (the moment of the
        # return to them is still to be confirmed: spec, section 6, item 1)
        return AI_PAID if self.purchased_tokens > 0 else AI_FREE

    @property
    def features(self) -> frozenset[str]:
        if self.plan is not None:
            return _PAID_FEATURES
        return _PACK_FEATURES if self.permanent_tools else frozenset()

    @property
    def seats(self) -> int:
        return self.plan.seats if self.plan is not None else TEAM_UNSUBSCRIBED_SEATS

    def models_available(self) -> tuple[str, ...]:
        """The models a person may pick now: the base one always, the strong ones with Токены+."""
        base = (settings.OPENROUTER_MODEL,)
        return base + strong_models() if self.ai_mode == AI_PAID else base


def subscription_active(row: TeamBilling, now: datetime) -> bool:
    return row.plan_code in TEAM_PLANS and row.period_end is not None and now < row.period_end


def view(row: TeamBilling, created_at: datetime, now: datetime) -> TeamState:
    """The state of the team's row at ``now``. Pure: nothing is written."""
    active = subscription_active(row, now)
    cycle_start, cycle_end = free_cycle(created_at, now)
    renewed = row.free_cycle_start is None or row.free_cycle_start < cycle_start
    return TeamState(
        plan=TEAM_PLANS[row.plan_code] if active else None,
        period_start=row.period_start if active else None,
        period_end=row.period_end if active else None,
        plan_tokens=max(row.plan_tokens, 0) if active else 0,
        purchased_tokens=max(row.purchased_tokens, 0),
        free_tokens=TEAM_FREE_TOKENS if renewed else max(row.free_tokens, 0),
        free_cycle_start=cycle_start,
        free_cycle_end=cycle_end,
        permanent_tools=row.permanent_tools_at is not None,
    )


def refresh(row: TeamBilling, created_at: datetime, now: datetime) -> None:
    """Write into the row what time has already changed: a new free cycle, an ended paid month."""
    cycle_start, _ = free_cycle(created_at, now)
    if row.free_cycle_start is None or row.free_cycle_start < cycle_start:
        row.free_tokens = TEAM_FREE_TOKENS
        row.free_cycle_start = cycle_start
    if row.plan_code is not None and not subscription_active(row, now):
        # The month is over: what is left of its quota burns, the packs stay
        row.plan_code = None
        row.plan_tokens = 0


def resolve_model(requested: str | None, state: TeamState) -> str:
    """The model an action runs on. The base model for everybody; a strong one only with Токены+.

    The check is the server's: the interface only shows the choice.
    """
    if is_base_model(requested):
        return settings.OPENROUTER_MODEL
    if requested not in strong_models():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "model_unknown", "message": "Такой модели нет в списке доступных."},
        )
    if state.ai_mode != AI_PAID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "model_locked",
                "message": "Выбор модели доступен, пока у команды есть Токены+.",
            },
        )
    return str(requested)


# ─── The row of a team ────────────────────────────────────────────────────────


async def _created_at(session: AsyncSession, org_id: uuid.UUID) -> datetime:
    created = (
        await session.execute(select(Organization.created_at).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if created is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return created


async def _ensure_row(session: AsyncSession, org_id: uuid.UUID, created_at: datetime, now: datetime) -> None:
    """Create the row of a team on first use; two requests at once make exactly one."""
    await session.execute(
        pg_insert(TeamBilling)
        .values(
            organization_id=org_id,
            plan_tokens=0,
            purchased_tokens=0,
            free_tokens=TEAM_FREE_TOKENS,
            free_cycle_start=free_cycle(created_at, now)[0],
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_nothing(index_elements=["organization_id"])
    )


async def locked_row(
    session: AsyncSession, org_id: uuid.UUID, now: datetime
) -> tuple[TeamBilling, datetime]:
    """The row of the team under a lock, brought up to ``now``. Whoever spends or grants goes through
    here, so the balances are changed one writer at a time."""
    created_at = await _created_at(session, org_id)
    await _ensure_row(session, org_id, created_at, now)
    row = (
        await session.execute(
            select(TeamBilling)
            .where(TeamBilling.organization_id == org_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    refresh(row, created_at, now)
    return row, created_at


async def get_state(session: AsyncSession, org_id: uuid.UUID, now: datetime | None = None) -> TeamState:
    """The state of the team for reading (no lock, nothing written, no row needed)."""
    now = now or datetime.now(timezone.utc)
    created_at = await _created_at(session, org_id)
    row = (
        await session.execute(select(TeamBilling).where(TeamBilling.organization_id == org_id))
    ).scalar_one_or_none()
    if row is None:
        cycle_start, cycle_end = free_cycle(created_at, now)
        return TeamState(None, None, None, 0, 0, TEAM_FREE_TOKENS, cycle_start, cycle_end, False)
    return view(row, created_at, now)


# ─── What the guards and the meter ask ───────────────────────────────────────


def entitlements_of(state: TeamState) -> billing_service.Entitlements:
    """The rights of the team in the shape every guard already reads."""
    if state.plan is not None:
        plan = replace(
            START,
            code=state.plan.code,
            title=state.plan.title,
            features=state.features,
            ai_tokens_per_period=state.plan.quota_tokens,
            price_month_kopecks=state.plan.price_kopecks,
        )
        start, end = state.period_start or state.free_cycle_start, state.period_end
    else:
        code = PLAN_PACK if state.permanent_tools else PLAN_START
        plan = replace(START, code=code, features=state.features, ai_tokens_per_period=TEAM_FREE_TOKENS)
        start, end = state.free_cycle_start, state.free_cycle_end
    return billing_service.Entitlements(
        plan=plan,
        status=STATUS_ACTIVE,
        billing_interval=INTERVAL_MONTH if state.plan is not None else INTERVAL_NONE,
        period_start=start,
        period_end=end or state.free_cycle_end,
        trial_ends_at=None,
        trial_used=False,
        cancel_at_period_end=False,
        billing_enabled=True,
        ai_window_start=start,
        ai_window_end=end,
        seats=state.seats,
    )


async def entitlements(
    session: AsyncSession, org_id: uuid.UUID, now: datetime | None = None
) -> billing_service.Entitlements:
    return entitlements_of(await get_state(session, org_id, now))


@dataclass(frozen=True)
class AiAccess:
    """The decision before an AI call: on which model it runs and from which balance it is paid."""

    mode: str
    model: str
    state: TeamState


async def check_ai_access(
    session: AsyncSession, org_id: uuid.UUID, requested_model: str | None, now: datetime | None = None
) -> AiAccess:
    """Is there anything to pay the action with, and may the team use the model it asked for.

    A paid month with both balances at zero refuses (``ai_suspended``) instead of using the free tokens;
    a free team refuses when its tokens of the cycle are gone. The refusals follow BILLING_ENFORCE like
    every other limit: in the shadow mode the action goes on and only the counter notices.
    """
    state = await get_state(session, org_id, now)
    model = resolve_model(requested_model, state)
    mode = state.ai_mode
    if mode == AI_SUSPENDED or (mode == AI_FREE and state.free_tokens <= 0):
        enforced = settings.BILLING_ENFORCE
        plan_code = state.plan.code if state.plan else PLAN_START
        limit = "ai_suspended" if mode == AI_SUSPENDED else "ai_tokens"
        BILLING_LIMIT_HIT.labels(limit, plan_code, "true" if enforced else "false").inc()
        if enforced:
            suspended = mode == AI_SUSPENDED
            resets_at = state.period_end if suspended else state.free_cycle_end
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "ai_suspended" if suspended else "limit_reached",
                    "limit": "ai_tokens",
                    "plan": plan_code,
                    "resets_at": resets_at.isoformat() if resets_at else None,
                    "can_buy": True,
                    "message": (
                        "Токены+ закончились. ИИ заработает после докупки пакета или нового месяца подписки."
                        if suspended
                        else "Бесплатные токены этого месяца закончились."
                    ),
                },
            )
    return AiAccess(mode=mode, model=model, state=state)


@dataclass(frozen=True)
class Charged:
    mode: str
    amount: int
    from_plan: int
    from_packs: int


async def charge(
    session: AsyncSession,
    org_id: uuid.UUID,
    real_tokens: int,
    model: str | None,
    now: datetime | None = None,
) -> Charged:
    """Take what an action really used from the team, under the lock; no commit.

    The mode is decided again under the lock, so a balance that ran out between the check and now is
    not driven below zero: whatever is left is taken and the rest of that one action is not charged.
    """
    now = now or datetime.now(timezone.utc)
    row, created_at = await locked_row(session, org_id, now)
    state = view(row, created_at, now)
    mode = state.ai_mode
    if mode == AI_SUSPENDED:
        return Charged(mode, 0, 0, 0)
    amount = charge_for(real_tokens, model, mode)
    if mode == AI_FREE:
        taken = min(row.free_tokens, amount)
        row.free_tokens -= taken
        return Charged(mode, taken, 0, 0)
    plan_left, packs_left, taken = spend(state.plan_tokens, state.purchased_tokens, amount)
    from_plan = state.plan_tokens - plan_left
    if state.plan is not None:
        row.plan_tokens = plan_left
    row.purchased_tokens = packs_left
    return Charged(mode, taken, from_plan, taken - from_plan)


# ─── Granting what was paid for ───────────────────────────────────────────────


async def apply_payment(session: AsyncSession, payment: Payment, now: datetime) -> None:
    """Give the team what a succeeded payment bought. The caller holds the payment row locked and
    sets ``applied_at`` after it, so a repeated confirmation never gets here a second time.

    ValueError: a subscription is already running under another plan; changing plans is not decided
    yet (spec, section 6, item 3), so the money has to go back by hand.
    """
    if payment.organization_id is None:
        raise ValueError("The payment has no team")
    row, _created = await locked_row(session, payment.organization_id, now)
    if payment.plan_code in TEAM_PLANS:
        plan = TEAM_PLANS[payment.plan_code]
        if row.plan_code is not None and row.plan_code != plan.code:
            raise ValueError("Another subscription is running")
        running = row.plan_code == plan.code
        # A renewal in the middle of the month adds a month and refills the quota at once; what was
        # left of the old quota is not added to it
        row.period_start = row.period_start if running else now
        row.period_end = (row.period_end if running else now) + _PERIOD
        row.plan_code = plan.code
        row.plan_tokens = plan.quota_tokens
        return
    if payment.plan_code == PLAN_TEAM_PACK:
        row.purchased_tokens += TEAM_PACK_TOKENS
        row.permanent_tools_at = row.permanent_tools_at or now
        return
    raise ValueError(f"Unknown team purchase: {payment.plan_code}")


# ─── What the screens show ────────────────────────────────────────────────────


def offers(state: TeamState | None = None) -> list[TeamOfferInfo]:
    """What a team can buy; without a state, the public catalogue of the price page."""
    running = state.plan.code if state is not None and state.plan is not None else None
    items = [
        TeamOfferInfo(
            kind=plan.code,
            title=plan.title,
            price_kopecks=plan.price_kopecks,
            tokens=plan.quota_tokens,
            seats=plan.seats,
            days=TEAM_PERIOD_DAYS,
            # Only the running plan can be paid again; moving to another one is not decided yet
            available=running in (None, plan.code),
        )
        for plan in TEAM_PLANS.values()
    ]
    items.append(
        TeamOfferInfo(
            kind=KIND_PACK,
            title="Разовый пакет",
            price_kopecks=TEAM_PACK_PRICE_KOPECKS,
            tokens=TEAM_PACK_TOKENS,
            seats=0,
        )
    )
    return items


def build_summary(org_id: uuid.UUID, state: TeamState, *, can_buy: bool) -> TeamBillingSummary:
    plan = state.plan
    return TeamBillingSummary(
        organization_id=org_id,
        plan_code=plan.code if plan else None,
        plan_title=plan.title if plan else None,
        period_end=state.period_end,
        seats=state.seats,
        subscription=(
            TeamBalanceInfo(remaining=state.plan_tokens, quota=plan.quota_tokens, resets_at=state.period_end)
            if plan
            else None
        ),
        purchased_tokens=state.purchased_tokens,
        free=TeamBalanceInfo(
            remaining=state.free_tokens, quota=TEAM_FREE_TOKENS, resets_at=state.free_cycle_end
        ),
        ai_mode=state.ai_mode,
        models=list(state.models_available()),
        features=sorted(state.features),
        permanent_tools=state.permanent_tools,
        can_buy=can_buy,
        enforced=settings.BILLING_ENFORCE,
        offers=offers(state),
    )


async def grant(session: AsyncSession, org_id: uuid.UUID, kind: str, now: datetime | None = None) -> TeamState:
    """Give a team a plan month or a pack without an online payment (an invoice, a gift); no commit.

    The same rules as a payment: a month refills the quota and extends the period, a pack adds its tokens
    and the permanent rights. ValueError for an unknown kind or another running plan.
    """
    now = now or datetime.now(timezone.utc)
    code = PLAN_TEAM_PACK if kind == KIND_PACK else kind
    if code not in TEAM_PLANS and code != PLAN_TEAM_PACK:
        raise ValueError(f"Unknown team purchase: {kind}")
    await apply_payment(session, _Grant(org_id, code), now)
    return await get_state(session, org_id, now)


async def revoke(session: AsyncSession, org_id: uuid.UUID, kind: str, now: datetime | None = None) -> TeamState:
    """Take back what a refunded purchase gave, by an operator's decision; no commit.

    A month of Plus / Pro ends now and its quota burns. A pack takes its 500 000 Токенов+ back from what is
    left of the purchased balance (what was spent stays spent). The permanent rights to the methodologies and
    the CSV are kept: what happens to them on a refund is not decided yet (spec, section 6, item 5).
    """
    now = now or datetime.now(timezone.utc)
    row, _created = await locked_row(session, org_id, now)
    if kind in TEAM_PLANS:
        if row.plan_code != kind:
            raise ValueError("This plan is not running")
        row.period_end = now
        row.plan_code = None
        row.plan_tokens = 0
    elif kind == KIND_PACK:
        row.purchased_tokens = max(row.purchased_tokens - TEAM_PACK_TOKENS, 0)
    else:
        raise ValueError(f"Unknown team purchase: {kind}")
    return await get_state(session, org_id, now)


@dataclass(frozen=True)
class _Grant:
    """What apply_payment reads of a payment, for a grant that has no payment row."""

    organization_id: uuid.UUID
    plan_code: str
