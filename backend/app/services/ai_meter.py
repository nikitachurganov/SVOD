"""Metering of one AI action: the limits before the LLM call, the real usage after it.

    async with ai_meter.action(user, ai_meter.ACTION_AI_CHAT, survey_id=survey.id):
        return await survey_ai_analysis_service.chat(...)

The meter uses short sessions of its own: the reservation has to be visible to parallel requests
before the slow LLM call starts, and it must not depend on the caller committing.

Always on: the AI switch of the account (``users.ai_enabled``), the optional spending cap of the
whole service, and the usage log. Only with BILLING_ENABLED: the plan's monthly counters and the
per-account budget. Only with BILLING_ENFORCE as well: they block (without it they just count).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import METRIC_AI_ACTIONS
from app.core.config import settings
from app.core.database import async_session_factory
from app.core.metrics import AI_ACTIONS, AI_COST_USD, AI_TOKENS, BILLING_LIMIT_HIT
from app.models.user import User
from app.repositories import billing_repository
from app.services import ai_usage, billing_service
from app.services import subscription_lifecycle_service as lifecycle

logger = logging.getLogger(__name__)

ACTION_SURVEY_BUILD = "survey_build"
ACTION_SURVEY_EDIT = "survey_edit"
ACTION_AI_SUMMARY = "ai_summary"
ACTION_AI_CHAT = "ai_chat"

OUTCOME_OK = "ok"
OUTCOME_FAILED = "failed"

LIMIT_AI_ACTIONS = "ai_actions"
LIMIT_AI_BUDGET = "ai_budget"
LIMIT_AI_DAILY_BUDGET = "ai_daily_budget"

_DAILY_WINDOW = timedelta(hours=24)


@dataclass(frozen=True)
class _Reservation:
    period_start: datetime


def _flag(enforced: bool) -> str:
    return "true" if enforced else "false"


async def _check_daily_budget(session: AsyncSession) -> None:
    """The cap on what the whole service spends on AI in 24 hours, a guard against a runaway bill."""
    cap = Decimal(str(settings.AI_DAILY_BUDGET_USD))
    if cap <= 0:
        return
    since = datetime.now(timezone.utc) - _DAILY_WINDOW
    if await billing_repository.sum_ai_cost_usd(session, since=since) >= cap:
        BILLING_LIMIT_HIT.labels(LIMIT_AI_DAILY_BUDGET, "all", _flag(True)).inc()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "ai_budget_exceeded",
                "message": "ИИ временно недоступен. Попробуйте позже.",
            },
        )


async def _reserve(user_id: uuid.UUID) -> _Reservation | None:
    """Take one action from the user's monthly quota before the LLM is called.

    Returns None when there is nothing to give back later (billing is off).
    """
    async with async_session_factory() as session:
        await _check_daily_budget(session)
        ent = await billing_service.get_entitlements(session, user_id)
        if not ent.billing_enabled:
            return None
        plan = ent.plan
        enforced = settings.BILLING_ENFORCE

        spent_usd = await billing_repository.sum_ai_cost_usd(
            session, since=ent.period_start, user_id=user_id
        )
        spent_rub = spent_usd * Decimal(str(settings.AI_COST_RUB_PER_USD))
        if spent_rub >= plan.ai_budget_rub_per_period:
            BILLING_LIMIT_HIT.labels(LIMIT_AI_BUDGET, plan.code, _flag(enforced)).inc()
            if enforced:
                raise billing_service.limit_reached_error(
                    ent, LIMIT_AI_BUDGET, int(spent_rub), plan.ai_budget_rub_per_period
                )

        # One statement: parallel requests cannot push the counter past the limit
        used = await billing_repository.reserve_usage(
            session,
            user_id,
            METRIC_AI_ACTIONS,
            ent.period_start,
            limit=plan.ai_actions_per_period if enforced else None,
        )
        if used is None:
            BILLING_LIMIT_HIT.labels(LIMIT_AI_ACTIONS, plan.code, _flag(True)).inc()
            counters = await billing_repository.get_usage(session, user_id, ent.period_start)
            raise billing_service.limit_reached_error(
                ent, LIMIT_AI_ACTIONS, counters.get(METRIC_AI_ACTIONS, 0), plan.ai_actions_per_period
            )
        if used > plan.ai_actions_per_period:
            # Shadow mode: this is the request that would have been refused
            BILLING_LIMIT_HIT.labels(LIMIT_AI_ACTIONS, plan.code, _flag(False)).inc()
        await lifecycle.warn_if_near_limit(
            session, user_id, METRIC_AI_ACTIONS, used, plan.ai_actions_per_period, ent.period_start
        )
        await session.commit()
        return _Reservation(period_start=ent.period_start)


async def _settle(
    user_id: uuid.UUID,
    name: str,
    survey_id: uuid.UUID | None,
    reservation: _Reservation | None,
    collector: ai_usage.UsageCollector,
    outcome: str,
) -> None:
    """Give the action back if it did not deliver, and write down what the LLM really used."""
    AI_ACTIONS.labels(name, outcome).inc()
    if collector.calls:
        AI_TOKENS.labels("prompt", name).inc(collector.prompt_tokens)
        AI_TOKENS.labels("completion", name).inc(collector.completion_tokens)
        AI_COST_USD.labels(name).inc(float(collector.cost_usd))

    # A failed action, or one that never reached the LLM (nothing was generated), is not charged
    refund = reservation is not None and (outcome == OUTCOME_FAILED or collector.calls == 0)
    if not refund and not collector.calls:
        return
    try:
        async with async_session_factory() as session:
            if refund:
                await billing_repository.release_usage(
                    session, user_id, METRIC_AI_ACTIONS, reservation.period_start
                )
            if collector.calls:
                # A failed action still cost tokens, so it stays in the log
                await billing_repository.add_ai_usage_log(
                    session,
                    user_id=user_id,
                    survey_id=survey_id,
                    action=name,
                    calls=collector.calls,
                    model=collector.model,
                    prompt_tokens=collector.prompt_tokens,
                    completion_tokens=collector.completion_tokens,
                    cost_usd=collector.cost_usd,
                    status=outcome,
                )
            await session.commit()
    except Exception:
        # The answer is already generated: bookkeeping must never take it away from the user
        logger.exception("Could not settle the AI usage of %s for user %s", name, user_id)


@asynccontextmanager
async def action(
    user: User, name: str, *, survey_id: uuid.UUID | None = None
) -> AsyncIterator[ai_usage.UsageCollector]:
    """Wrap everything that calls the LLM for one user-facing AI action."""
    if not user.ai_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ai_disabled",
                "message": "ИИ отключён для вашего аккаунта. Напишите в поддержку.",
            },
        )
    reservation = await _reserve(user.id)
    collector = ai_usage.UsageCollector()
    token = ai_usage.activate(collector)
    outcome = OUTCOME_OK
    try:
        yield collector
    except BaseException:
        outcome = OUTCOME_FAILED
        raise
    finally:
        ai_usage.deactivate(token)
        await _settle(user.id, name, survey_id, reservation, collector, outcome)
