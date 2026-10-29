"""Plans with limits on collecting data, for the tests of the guard that enforces them.

The catalogue itself limits nothing but the AI tokens (docs/MONETIZATION_MODEL.md). The guard still
refuses surveys, projects, questions and responses over a limit, because an administrator can limit
one person (``limit_overrides``). These plans carry the numbers such a person would have, so the
tests of the guard keep checking real boundaries.
"""

from __future__ import annotations

import dataclasses

from app.constants.billing_plans import RESEARCHER, START

LIMITED_START = dataclasses.replace(
    START,
    max_active_surveys=3,
    max_projects=1,
    max_questions=20,
    responses_per_period=100,
    max_analyzed_responses=100,
)

LIMITED_RESEARCHER = dataclasses.replace(
    RESEARCHER,
    max_active_surveys=20,
    max_projects=10,
    max_questions=50,
    responses_per_period=3_000,
    max_analyzed_responses=3_000,
)
