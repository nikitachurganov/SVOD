"""Reads for the administrator's pages: the user table, the counters and the AI spending.

Nothing here changes data. "Which plan does a person have" depends on the clock, so the tiers are
SQL conditions built from ``now`` and mirror ``billing_service.effective_plan_code``.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, and_, case, false, func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import (
    PLAN_START,
    STATUS_ACTIVE,
    STATUS_PAST_DUE,
    STATUS_TRIALING,
)
from app.models.ai_usage_log import AIUsageLog
from app.models.organization import Organization
from app.models.subscription import Subscription
from app.models.survey import Survey, SurveyProject, SurveyResponse
from app.models.usage_counter import UsageCounter
from app.models.user import User
from app.repositories.survey_repository import WELCOME_PROJECT_NAME

TIER_FREE = "free"
TIER_PAID = "paid"
TIER_TRIAL = "trial"
TIER_PAST_DUE = "past_due"
TIERS = (TIER_FREE, TIER_PAID, TIER_TRIAL, TIER_PAST_DUE)

SORT_COLUMNS = ("created_at", "last_login_at", "email", "name", "plan_ends_at")


def _not_the_sample() -> ColumnElement[bool]:
    """Leaves out the sample survey every personal workspace starts with: it is not the person's own."""
    return or_(SurveyProject.id.is_(None), SurveyProject.name != WELCOME_PROJECT_NAME)


def _like_pattern(text_value: str) -> str:
    escaped = text_value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def tier_conditions(
    now: datetime, grace_days: int
) -> tuple[ColumnElement[bool], ColumnElement[bool], ColumnElement[bool]]:
    """(paid and running, trial running, paid but late within the grace period)."""
    paid_plan = Subscription.plan_code != PLAN_START
    active = and_(
        paid_plan, Subscription.status == STATUS_ACTIVE, Subscription.current_period_end > now
    )
    trial = and_(
        paid_plan, Subscription.status == STATUS_TRIALING, Subscription.trial_ends_at > now
    )
    past_due = and_(
        paid_plan,
        Subscription.status == STATUS_PAST_DUE,
        Subscription.current_period_end + timedelta(days=grace_days) > now,
    )
    return active, trial, past_due


def _tier_condition(tier: str, now: datetime, grace_days: int) -> ColumnElement[bool]:
    active, trial, past_due = tier_conditions(now, grace_days)
    if tier == TIER_PAID:
        return active
    if tier == TIER_TRIAL:
        return trial
    if tier == TIER_PAST_DUE:
        return past_due
    # A person without a subscription row is on the free plan; NULL comparisons must not hide them
    return ~func.coalesce(or_(active, trial, past_due), false())


def _order_by(sort: str, descending: bool, now: datetime, grace_days: int) -> list[ColumnElement]:
    if sort == "name":
        columns = [func.lower(User.last_name), func.lower(User.first_name)]
    elif sort == "email":
        columns = [func.lower(User.email)]
    elif sort == "last_login_at":
        columns = [User.last_login_at]
    elif sort == "plan_ends_at":
        # The table shows the end of the plan that applies now; a free person has none, whatever
        # date the stored period carries
        active, trial, past_due = tier_conditions(now, grace_days)
        columns = [case((or_(active, trial, past_due), Subscription.current_period_end), else_=None)]
    else:
        columns = [User.created_at]
    ordered = [(c.desc() if descending else c.asc()).nulls_last() for c in columns]
    # A stable order, so a row never appears on two pages
    return [*ordered, User.id.asc()]


async def list_users(
    session: AsyncSession,
    *,
    now: datetime,
    grace_days: int,
    query: str | None,
    tier: str | None,
    email_verified: bool | None,
    is_active: bool | None,
    role: str | None,
    deletion_requested: bool | None,
    sort: str,
    descending: bool,
    offset: int,
    limit: int,
) -> tuple[list[tuple[User, Subscription | None]], int]:
    conditions: list[ColumnElement[bool]] = []
    if query:
        pattern = _like_pattern(query.strip())
        conditions.append(
            or_(
                User.email.ilike(pattern, escape="\\"),
                User.full_name.ilike(pattern, escape="\\"),
                User.first_name.ilike(pattern, escape="\\"),
                User.last_name.ilike(pattern, escape="\\"),
            )
        )
    if tier is not None:
        conditions.append(_tier_condition(tier, now, grace_days))
    if email_verified is not None:
        conditions.append(
            User.email_verified_at.is_not(None) if email_verified else User.email_verified_at.is_(None)
        )
    if is_active is not None:
        conditions.append(User.is_active.is_(is_active))
    if role is not None:
        conditions.append(User.role == role)
    if deletion_requested is not None:
        conditions.append(
            User.deletion_requested_at.is_not(None)
            if deletion_requested
            else User.deletion_requested_at.is_(None)
        )

    join = User.id == Subscription.user_id
    stmt = select(User, Subscription).outerjoin(Subscription, join)
    count_stmt = select(func.count(User.id)).select_from(User).outerjoin(Subscription, join)
    for condition in conditions:
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    rows = (
        await session.execute(
            stmt.order_by(*_order_by(sort, descending, now, grace_days))
            .offset(offset)
            .limit(limit)
        )
    ).all()
    total = int((await session.execute(count_stmt)).scalar_one() or 0)
    return [(user, sub) for user, sub in rows], total


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


async def count_other_active_admins(
    session: AsyncSession, admin_role: str, excluding: uuid.UUID
) -> int:
    result = await session.execute(
        select(func.count(User.id)).where(
            User.role == admin_role, User.is_active.is_(True), User.id != excluding
        )
    )
    return int(result.scalar_one() or 0)


async def emails_by_id(session: AsyncSession, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not user_ids:
        return {}
    result = await session.execute(select(User.id, User.email).where(User.id.in_(user_ids)))
    return {user_id: email for user_id, email in result.all()}


# ─── Per-row numbers for one page of the table ────────────────────────────────


async def usage_by_user(
    session: AsyncSession, periods: dict[uuid.UUID, datetime], metric: str
) -> dict[uuid.UUID, int]:
    """The metered value of the metric in each user's own billing period."""
    if not periods:
        return {}
    pairs = [(user_id, start) for user_id, start in periods.items()]
    result = await session.execute(
        select(UsageCounter.user_id, UsageCounter.value).where(
            UsageCounter.metric == metric,
            tuple_(UsageCounter.user_id, UsageCounter.period_start).in_(pairs),
        )
    )
    return {user_id: value for user_id, value in result.all()}


async def survey_counts_by_owner(
    session: AsyncSession, owner_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    if not owner_ids:
        return {}
    result = await session.execute(
        select(Organization.owner_user_id, func.count(Survey.id))
        .join(Survey, Survey.organization_id == Organization.id)
        .outerjoin(SurveyProject, SurveyProject.id == Survey.project_id)
        .where(
            Organization.owner_user_id.in_(owner_ids),
            Survey.status != "archived",
            _not_the_sample(),
        )
        .group_by(Organization.owner_user_id)
    )
    return {owner_id: count for owner_id, count in result.all()}


async def response_counts_by_owner(
    session: AsyncSession, owner_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Responses the owner can see (those kept back by the quota are not counted)."""
    if not owner_ids:
        return {}
    result = await session.execute(
        select(Organization.owner_user_id, func.count(SurveyResponse.id))
        .join(Survey, Survey.organization_id == Organization.id)
        .join(SurveyResponse, SurveyResponse.survey_id == Survey.id)
        .outerjoin(SurveyProject, SurveyProject.id == Survey.project_id)
        .where(
            Organization.owner_user_id.in_(owner_ids),
            SurveyResponse.locked.is_(False),
            _not_the_sample(),
        )
        .group_by(Organization.owner_user_id)
    )
    return {owner_id: count for owner_id, count in result.all()}


# ─── The summary page ─────────────────────────────────────────────────────────


async def user_totals(session: AsyncSession, now: datetime) -> dict[str, int]:
    week, month = now - timedelta(days=7), now - timedelta(days=30)
    row = (
        await session.execute(
            select(
                func.count(User.id),
                func.count(User.id).filter(User.created_at >= week),
                func.count(User.id).filter(User.created_at >= month),
                func.count(User.id).filter(User.last_login_at >= month),
                func.count(User.id).filter(User.email_verified_at.is_not(None)),
                func.count(User.id).filter(User.is_active.is_(False)),
            )
        )
    ).one()
    keys = ("total", "new_7d", "new_30d", "active_30d", "email_verified", "blocked")
    return {key: int(value or 0) for key, value in zip(keys, row)}


async def tier_totals(session: AsyncSession, now: datetime, grace_days: int) -> dict[str, int]:
    active, trial, past_due = tier_conditions(now, grace_days)
    row = (
        await session.execute(
            select(
                func.count(User.id),
                func.count(User.id).filter(active),
                func.count(User.id).filter(trial),
                func.count(User.id).filter(past_due),
            )
            .select_from(User)
            .outerjoin(Subscription, User.id == Subscription.user_id)
        )
    ).one()
    total, paid, on_trial, late = (int(value or 0) for value in row)
    return {
        TIER_PAID: paid,
        TIER_TRIAL: on_trial,
        TIER_PAST_DUE: late,
        TIER_FREE: total - paid - on_trial - late,
    }


async def paid_by_interval(
    session: AsyncSession, now: datetime
) -> list[tuple[str, str, int]]:
    """(plan, billing interval, how many) for the paid plans that run now, trials excluded."""
    active, _, _ = tier_conditions(now, 0)
    result = await session.execute(
        select(Subscription.plan_code, Subscription.billing_interval, func.count(Subscription.id))
        .where(active)
        .group_by(Subscription.plan_code, Subscription.billing_interval)
    )
    return [(plan, interval, int(count)) for plan, interval, count in result.all()]


async def list_ai_usage(
    session: AsyncSession, user_id: uuid.UUID, *, limit: int
) -> list[AIUsageLog]:
    result = await session.execute(
        select(AIUsageLog)
        .where(AIUsageLog.user_id == user_id)
        .order_by(AIUsageLog.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
