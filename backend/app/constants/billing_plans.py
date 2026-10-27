"""Plan catalogue. Prices and limits live in code; the database stores only the plan code."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from types import MappingProxyType
from typing import Any

PLAN_START = "start"
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

METRIC_AI_ACTIONS = "ai_actions"
METRIC_RESPONSES = "responses"

# A billing period is 30 days from the start of the subscription, not a calendar month
PERIOD_DAYS = 30

# One-off "Course work" pack: the Researcher plan for 30 days without auto-renewal
COURSE_PACK_PRICE_KOPECKS = 49_000
COURSE_PACK_DAYS = 30

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
    ai_actions_per_period: int
    # Cap on the AI cost per period, in roubles (about 15 % of the price)
    ai_budget_rub_per_period: int
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
    "ai_actions_per_period",
    "ai_budget_rub_per_period",
)

_PAID_FEATURES = frozenset(
    {FEATURE_CROSSTABS, FEATURE_CSV_EXPORT, FEATURE_QUALITY_FILTER, FEATURE_ALL_METHODOLOGIES}
)

# Methodologies of the catalogue open on the free plan (the "student set"); the paid plan has all 16
BASIC_METHODOLOGIES = frozenset(
    {"likert", "nps", "csat", "cognitive_interviewing", "attention_check"}
)

START = Plan(
    code=PLAN_START,
    title="Старт",
    max_active_surveys=3,
    max_projects=1,
    max_questions=20,
    responses_per_period=100,
    max_analyzed_responses=100,
    ai_actions_per_period=15,
    ai_budget_rub_per_period=30,
    features=frozenset(),
    price_month_kopecks=0,
    price_year_kopecks=0,
)

RESEARCHER = Plan(
    code=PLAN_RESEARCHER,
    title="Исследователь",
    max_active_surveys=20,
    max_projects=10,
    max_questions=50,
    responses_per_period=3_000,
    max_analyzed_responses=3_000,
    ai_actions_per_period=200,
    ai_budget_rub_per_period=120,
    features=_PAID_FEATURES,
    price_month_kopecks=79_000,
    price_year_kopecks=790_000,
)

UNLIMITED = Plan(
    code=PLAN_UNLIMITED,
    title="Без ограничений",
    max_active_surveys=_NO_LIMIT,
    max_projects=_NO_LIMIT,
    max_questions=_NO_LIMIT,
    responses_per_period=_NO_LIMIT,
    max_analyzed_responses=_NO_LIMIT,
    ai_actions_per_period=_NO_LIMIT,
    ai_budget_rub_per_period=_NO_LIMIT,
    features=_PAID_FEATURES,
    price_month_kopecks=0,
    price_year_kopecks=0,
)

# Plans a user can have in the database, in the order they are shown
PLANS: Mapping[str, Plan] = MappingProxyType({PLAN_START: START, PLAN_RESEARCHER: RESEARCHER})


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
