"""Product limits of the plan: every rule in one place, one line in each service that needs it.

BILLING_ENABLED off: nothing is limited and the database is not touched. Shadow mode
(BILLING_ENFORCE off): a broken rule is only counted in svod_billing_limit_hit_total with
enforced="false" and the action goes through; the first weeks of the beta measure exactly that.
Enforced: the rule refuses with 402 limit_reached (see billing_service.limit_reached_error).

Whose plan: the one of the user who acts, counted over the organizations they own. The limits of
what respondents send (the response quota) are the survey owner's and come with stage 4.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import (
    BASIC_METHODOLOGIES,
    FEATURE_ALL_METHODOLOGIES,
    FEATURE_CROSSTABS,
    FEATURE_QUALITY_FILTER,
    METRIC_RESPONSES,
)
from app.core.config import settings
from app.core.metrics import BILLING_LIMIT_HIT
from app.knowledge.methodologies import METHODOLOGIES
from app.models.user import User
from app.repositories import billing_repository, survey_repository
from app.services import billing_service, survey_methodology_service, survey_quality
from app.services import subscription_lifecycle_service as lifecycle
from app.services.billing_service import Entitlements

LIMIT_ACTIVE_SURVEYS = "active_surveys"
LIMIT_PROJECTS = "projects"
LIMIT_QUESTIONS = "questions"
LIMIT_ANALYSIS_ROWS = "analysis_rows"
LIMIT_FEATURE_QUALITY_FILTER = "feature_quality_filter"
LIMIT_FEATURE_METHODOLOGY = "feature_methodology"
LIMIT_RESPONSES = "responses"


def _enforced(ent: Entitlements) -> bool:
    return ent.billing_enabled and settings.BILLING_ENFORCE


def _broken(ent: Entitlements, limit: str) -> bool:
    """A rule was broken: count it, and say whether the action has to be refused."""
    enforced = _enforced(ent)
    BILLING_LIMIT_HIT.labels(limit, ent.plan.code, "true" if enforced else "false").inc()
    return enforced


async def entitlements(session: AsyncSession, user: User) -> Entitlements:
    return await billing_service.get_entitlements(session, user.id)


# ─── Counts: published surveys, projects, questions ───────────────────────────


async def ensure_can_open_survey(session: AsyncSession, user: User) -> None:
    ent = await entitlements(session, user)
    if not ent.billing_enabled:
        return
    maximum = ent.plan.max_active_surveys
    used = await survey_repository.count_open_surveys_for_owner(session, user.id)
    if used >= maximum and _broken(ent, LIMIT_ACTIVE_SURVEYS):
        raise billing_service.limit_reached_error(ent, LIMIT_ACTIVE_SURVEYS, used, maximum)


async def ensure_can_add_project(session: AsyncSession, user: User) -> None:
    ent = await entitlements(session, user)
    if not ent.billing_enabled:
        return
    maximum = ent.plan.max_projects
    used = await survey_repository.count_projects_for_owner(session, user.id)
    if used >= maximum and _broken(ent, LIMIT_PROJECTS):
        raise billing_service.limit_reached_error(ent, LIMIT_PROJECTS, used, maximum)


async def ensure_questions_within_limit(
    session: AsyncSession, user: User, pages: Any, *, previous_pages: Any = None
) -> None:
    """Refuse a survey with more questions than the plan allows.

    With ``previous_pages`` (an edit) a survey that is already over the limit, because the plan
    got smaller, can still be edited; it just cannot be made longer.
    """
    ent = await entitlements(session, user)
    if not ent.billing_enabled:
        return
    maximum = ent.plan.max_questions
    count = survey_methodology_service.count_questions(pages)
    if count <= maximum:
        return
    if previous_pages is not None and count <= survey_methodology_service.count_questions(
        previous_pages
    ):
        return
    if _broken(ent, LIMIT_QUESTIONS):
        raise billing_service.limit_reached_error(ent, LIMIT_QUESTIONS, count, maximum)


def question_cap(ent: Entitlements) -> int | None:
    """The question limit to tell the AI builder, so it does not build what cannot be saved."""
    return ent.plan.max_questions if _enforced(ent) else None


# ─── Features of the plan ─────────────────────────────────────────────────────


async def ensure_feature(session: AsyncSession, user: User, feature: str) -> None:
    ent = await entitlements(session, user)
    if not ent.billing_enabled or feature in ent.plan.features:
        return
    if _broken(ent, f"feature_{feature}"):
        raise billing_service.feature_locked_error(ent, feature)


def allowed_methodologies(ent: Entitlements) -> frozenset[str] | None:
    """None: every methodology. Only the enforced free plan is limited to the basic set."""
    if not _enforced(ent) or FEATURE_ALL_METHODOLOGIES in ent.plan.features:
        return None
    return BASIC_METHODOLOGIES


def ensure_methodologies(ent: Entitlements, requested: Iterable[str] | None) -> None:
    """The user picked methodologies by hand: refuse those the plan does not include."""
    if not ent.billing_enabled or FEATURE_ALL_METHODOLOGIES in ent.plan.features:
        return
    locked = [
        m
        for m in dict.fromkeys(requested or [])
        if m in METHODOLOGIES and m not in BASIC_METHODOLOGIES
    ]
    if locked and _broken(ent, LIMIT_FEATURE_METHODOLOGY):
        raise billing_service.feature_locked_error(ent, "methodology", methodologies=locked)


# ─── Responses sent by respondents ────────────────────────────────────────────


async def register_response(session: AsyncSession, survey: Any) -> bool:
    """Count a response against the survey owner's quota. True: it is over the quota, lock it.

    The respondent is never refused and never sees a difference: the answer is accepted and kept,
    and the owner gets it back with a bigger plan. The counter belongs to the owner, not to the
    respondent, who has no account. It is written in the caller's transaction together with the
    response (the caller commits), and one statement hands out the numbers, so parallel
    submissions are neither counted twice nor skipped. The quota blocks only when enforced; in
    shadow mode the overflow is just counted. Demo-tour responses do not come through here.
    """
    if not settings.BILLING_ENABLED:
        return False
    owner_id = survey.organization.owner_user_id
    ent = await billing_service.get_entitlements(session, owner_id)
    if not ent.billing_enabled:
        return False
    number = await billing_repository.reserve_usage(
        session, owner_id, METRIC_RESPONSES, ent.period_start, limit=None
    )
    limit = ent.plan.responses_per_period
    await lifecycle.warn_if_near_limit(
        session, owner_id, METRIC_RESPONSES, number, limit, ent.period_start
    )
    return number > limit and _broken(ent, LIMIT_RESPONSES)


# ─── Analysis of the collected responses ──────────────────────────────────────


@dataclass(frozen=True)
class Analysis:
    # Newest first, at most what the plan analyses
    rows: list[Any]
    # Every response of the survey, also the ones beyond the plan's analysis limit
    total: int
    # What to pass on: the request, unless the plan cannot take bad responses out
    exclude_flagged: bool
    # False: the plan has no cross-tabulation and the AI chat must not build one
    crosstab_allowed: bool


async def load_analysis(
    session: AsyncSession,
    user: User,
    survey_id: uuid.UUID,
    *,
    ceiling: int,
    exclude_flagged: bool = True,
) -> Analysis:
    """The responses an analysis (results, answers, AI) works on, within the plan's limits.

    The plan analyses its newest responses up to ``max_analyzed_responses``; the rest stay
    collected and come back with a bigger plan. The free plan marks bad responses (a failed
    attention check, too fast) but only the paid one takes them out of the analysis.
    """
    ent = await entitlements(session, user)
    enforced = _enforced(ent)
    cap = ent.plan.max_analyzed_responses
    limit = min(ceiling, cap) if enforced else ceiling
    rows = await survey_repository.list_responses(session, survey_id, limit=limit)

    total = len(rows)
    if total >= limit:
        # The list may have been cut off, and numbering needs the real count
        total = max(total, await survey_repository.count_responses(session, survey_id))
    if ent.billing_enabled and total > cap:
        _broken(ent, LIMIT_ANALYSIS_ROWS)

    if (
        exclude_flagged
        and ent.billing_enabled
        and FEATURE_QUALITY_FILTER not in ent.plan.features
        and any(survey_quality.excludes_from_analysis(r.quality_flags) for r in rows)
        and _broken(ent, LIMIT_FEATURE_QUALITY_FILTER)
    ):
        exclude_flagged = False

    return Analysis(
        rows=rows,
        total=total,
        exclude_flagged=exclude_flagged,
        crosstab_allowed=not enforced or FEATURE_CROSSTABS in ent.plan.features,
    )
