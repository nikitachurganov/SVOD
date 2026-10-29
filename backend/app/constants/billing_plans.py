"""Plan catalogue. Prices and limits live in code; the database stores only the plan code."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from types import MappingProxyType
from typing import Any

PLAN_START = "start"
# One-off access: a fixed allowance of AI tokens for a fixed time, no auto-renewal
PLAN_PACK = "pack"
PLAN_RESEARCHER = "researcher"
# Stand-in plan while billing is switched off: no limits, every feature
PLAN_UNLIMITED = "unlimited"

STATUS_ACTIVE = "active"
STATUS_TRIALING = "trialing"
STATUS_PAST_DUE = "past_due"
STATUS_EXPIRED = "expired"

INTERVAL_NONE = "none"
INTERVAL_MONTH = "month"
INTERVAL_YEAR = "year"
INTERVAL_ONE_OFF = "one_off"

FEATURE_CROSSTABS = "crosstabs"
FEATURE_CSV_EXPORT = "csv_export"
FEATURE_QUALITY_FILTER = "quality_filter"
FEATURE_ALL_METHODOLOGIES = "all_methodologies"

METRIC_AI_TOKENS = "ai_tokens"
METRIC_RESPONSES = "responses"

# A billing period is 30 days from the start of the subscription, not a calendar month
PERIOD_DAYS = 30

# One-off pack ("Исследование"): a fixed allowance of AI tokens, no auto-renewal
PACK_PRICE_KOPECKS = 25_000
PACK_DAYS = 60

# Where the AI allowance of a plan is counted over
AI_WINDOW_LIFETIME = "lifetime"  # once, for good (the free plan)
AI_WINDOW_PERIOD = "period"  # the whole paid period (the one-off pack)
AI_WINDOW_MONTH = "month"  # renewed every 30 days inside the paid period (the subscription)

# The free allowance is not renewed, so its counter lives under one fixed moment
AI_LIFETIME_ANCHOR = datetime(2000, 1, 1, tzinfo=timezone.utc)

# Collecting data is never limited: surveys, responses and the plain analysis are open on every
# plan, only the AI is metered (see docs/MONETIZATION_MODEL.md)
_NO_LIMIT = 1_000_000_000


@dataclass(frozen=True)
class Plan:
    code: str
    title: str
    max_active_surveys: int
    max_projects: int
    max_questions: int
    responses_per_period: int
    max_analyzed_responses: int
    # AI allowance in tokens (prompt + completion) over `ai_window`
    ai_tokens_per_period: int
    ai_window: str
    features: frozenset[str]
    price_month_kopecks: int
    price_year_kopecks: int


# The numeric limits an administrator may override for one user
LIMIT_FIELDS = (
    "max_active_surveys",
    "max_projects",
    "max_questions",
    "responses_per_period",
    "max_analyzed_responses",
    "ai_tokens_per_period",
)

_PAID_FEATURES = frozenset(
    {FEATURE_CROSSTABS, FEATURE_CSV_EXPORT, FEATURE_QUALITY_FILTER, FEATURE_ALL_METHODOLOGIES}
)
# The one-off pack opens the full export, not the cross-tabs and the bot filter of the subscription
_PACK_FEATURES = frozenset({FEATURE_CSV_EXPORT, FEATURE_ALL_METHODOLOGIES})

# Methodologies of the catalogue open on the free plan (the "student set"); the paid plan has all 16
BASIC_METHODOLOGIES = frozenset(
    {"likert", "nps", "csat", "cognitive_interviewing", "attention_check"}
)

START = Plan(
    code=PLAN_START,
    title="Старт",
    max_active_surveys=_NO_LIMIT,
    max_projects=_NO_LIMIT,
    max_questions=_NO_LIMIT,
    responses_per_period=_NO_LIMIT,
    max_analyzed_responses=_NO_LIMIT,
    ai_tokens_per_period=150_000,
    ai_window=AI_WINDOW_LIFETIME,
    features=frozenset(),
    price_month_kopecks=0,
    price_year_kopecks=0,
)

# Sold once for PACK_PRICE_KOPECKS, so it has no monthly or yearly price
PACK = Plan(
    code=PLAN_PACK,
    title="Исследование",
    max_active_surveys=_NO_LIMIT,
    max_projects=_NO_LIMIT,
    max_questions=_NO_LIMIT,
    responses_per_period=_NO_LIMIT,
    max_analyzed_responses=_NO_LIMIT,
    ai_tokens_per_period=2_000_000,
    ai_window=AI_WINDOW_PERIOD,
    features=_PACK_FEATURES,
    price_month_kopecks=0,
    price_year_kopecks=0,
)

RESEARCHER = Plan(
    code=PLAN_RESEARCHER,
    title="Исследователь",
    max_active_surveys=_NO_LIMIT,
    max_projects=_NO_LIMIT,
    max_questions=_NO_LIMIT,
    responses_per_period=_NO_LIMIT,
    max_analyzed_responses=_NO_LIMIT,
    ai_tokens_per_period=6_000_000,
    ai_window=AI_WINDOW_MONTH,
    features=_PAID_FEATURES,
    price_month_kopecks=60_000,
    # 25 % off twelve months
    price_year_kopecks=540_000,
)

UNLIMITED = Plan(
    code=PLAN_UNLIMITED,
    title="Без ограничений",
    max_active_surveys=_NO_LIMIT,
    max_projects=_NO_LIMIT,
    max_questions=_NO_LIMIT,
    responses_per_period=_NO_LIMIT,
    max_analyzed_responses=_NO_LIMIT,
    ai_tokens_per_period=_NO_LIMIT,
    ai_window=AI_WINDOW_PERIOD,
    features=_PAID_FEATURES,
    price_month_kopecks=0,
    price_year_kopecks=0,
)

# Plans a user can have in the database, in the order they are shown
PLANS: Mapping[str, Plan] = MappingProxyType(
    {PLAN_START: START, PLAN_PACK: PACK, PLAN_RESEARCHER: RESEARCHER}
)


def get_plan(code: str | None) -> Plan:
    """Unknown or missing code falls back to the free plan (the safe failure)."""
    return PLANS.get(code or "", START)


def clean_overrides(overrides: Mapping[str, Any] | None) -> dict[str, int]:
    """Only the known limits with non-negative integer values; anything else is dropped."""
    if not isinstance(overrides, Mapping):
        return {}
    return {
        key: value
        for key, value in overrides.items()
        if key in LIMIT_FIELDS
        and isinstance(value, int)
        and not isinstance(value, bool)
        and value >= 0
    }


def apply_overrides(plan: Plan, overrides: Mapping[str, Any] | None) -> Plan:
    """Per-user limits set by an administrator.

    Unknown keys and values that are not non-negative integers are ignored, so a bad value in
    the database can never widen or break the plan.
    """
    valid = clean_overrides(overrides)
    return replace(plan, **valid) if valid else plan
