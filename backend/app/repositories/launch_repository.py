"""Counts for the launch: the pre-flight check, the first numbers and the operational alerts.

Reads only, except ``delete_response_counters``, the one step of the switch from shadow mode.
"""

from datetime import datetime

from sqlalchemy import delete, exists, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import METRIC_RESPONSES
from app.models.ai_usage_log import AIUsageLog
from app.models.organization import Organization
from app.models.payment import OPEN_STATUSES, PAYMENT_FAILED, PAYMENT_SUCCEEDED, Payment
from app.models.subscription import Subscription
from app.models.survey import Survey, SurveyProject, SurveyResponse
from app.models.usage_counter import UsageCounter
from app.models.user import User
from app.repositories import admin_repository
from app.repositories.survey_repository import WELCOME_PROJECT_NAME


async def count_active_admins(session: AsyncSession, admin_role: str) -> int:
    result = await session.execute(
        select(func.count(User.id)).where(User.role == admin_role, User.is_active.is_(True))
    )
    return int(result.scalar_one() or 0)


async def current_revision(session: AsyncSession) -> str | None:
    """The migration the database is at; None when the table does not exist."""
    try:
        result = await session.execute(text("SELECT version_num FROM alembic_version"))
    except Exception:
        await session.rollback()
        return None
    return result.scalar_one_or_none()


async def response_counters(session: AsyncSession) -> tuple[int, int]:
    """(rows, the sum) of the response counters: what shadow mode has counted so far."""
    result = await session.execute(
        select(func.count(), func.coalesce(func.sum(UsageCounter.value), 0)).where(
            UsageCounter.metric == METRIC_RESPONSES
        )
    )
    rows, total = result.one()
    return int(rows or 0), int(total or 0)


async def delete_response_counters(session: AsyncSession) -> int:
    result = await session.execute(
        delete(UsageCounter).where(UsageCounter.metric == METRIC_RESPONSES)
    )
    return int(result.rowcount or 0)


async def count_locked_responses(session: AsyncSession) -> int:
    result = await session.execute(
        select(func.count(SurveyResponse.id)).where(SurveyResponse.locked.is_(True))
    )
    return int(result.scalar_one() or 0)


async def count_users(session: AsyncSession) -> int:
    return int((await session.execute(select(func.count(User.id)))).scalar_one() or 0)


async def count_open_payments(session: AsyncSession, *, older_than: datetime) -> int:
    """Payments the provider has not settled for a long time."""
    result = await session.execute(
        select(func.count(Payment.id)).where(
            Payment.status.in_(OPEN_STATUSES), Payment.created_at <= older_than
        )
    )
    return int(result.scalar_one() or 0)


async def count_failed_payments(session: AsyncSession, *, since: datetime) -> int:
    result = await session.execute(
        select(func.count(Payment.id)).where(
            Payment.status == PAYMENT_FAILED, Payment.created_at >= since
        )
    )
    return int(result.scalar_one() or 0)


async def ai_outcomes_since(session: AsyncSession, since: datetime) -> tuple[int, int]:
    """(AI actions, failed ones) since the moment: a jump of failures means the proxy or OpenRouter is down."""
    result = await session.execute(
        select(func.count(), func.count().filter(AIUsageLog.status != "ok")).where(
            AIUsageLog.created_at >= since
        )
    )
    total, failed = result.one()
    return int(total or 0), int(failed or 0)


async def funnel(session: AsyncSession, *, since: datetime, now: datetime, grace_days: int) -> dict[str, int]:
    """Where the people who registered since the moment got to: the numbers the launch is judged by."""
    sample = or_(SurveyProject.id.is_(None), SurveyProject.name != WELCOME_PROJECT_NAME)
    has_survey = exists(
        select(Survey.id)
        .join(Organization, Organization.id == Survey.organization_id)
        .outerjoin(SurveyProject, SurveyProject.id == Survey.project_id)
        .where(Organization.owner_user_id == User.id, Survey.status != "archived", sample)
    )
    has_response = exists(
        select(SurveyResponse.id)
        .join(Survey, Survey.id == SurveyResponse.survey_id)
        .join(Organization, Organization.id == Survey.organization_id)
        .outerjoin(SurveyProject, SurveyProject.id == Survey.project_id)
        .where(Organization.owner_user_id == User.id, SurveyResponse.locked.is_(False), sample)
    )
    paid_online = exists(
        select(Payment.id).where(
            Payment.user_id == User.id,
            Payment.status == PAYMENT_SUCCEEDED,
            Payment.is_test.is_(False),
        )
    )
    active, _trial, _late = admin_repository.tier_conditions(now, grace_days)
    on_paid_plan = exists(select(Subscription.id).where(Subscription.user_id == User.id, active))
    used_trial = exists(
        select(Subscription.id).where(
            Subscription.user_id == User.id, Subscription.trial_used_at.is_not(None)
        )
    )
    row = (
        await session.execute(
            select(
                func.count(User.id),
                func.count(User.id).filter(User.email_verified_at.is_not(None)),
                func.count(User.id).filter(has_survey),
                func.count(User.id).filter(has_response),
                func.count(User.id).filter(used_trial),
                func.count(User.id).filter(paid_online),
                func.count(User.id).filter(on_paid_plan),
            ).where(User.created_at >= since)
        )
    ).one()
    keys = (
        "registered",
        "email_verified",
        "created_survey",
        "got_response",
        "used_trial",
        "paid_online",
        "on_paid_plan",
    )
    return {key: int(value or 0) for key, value in zip(keys, row)}
