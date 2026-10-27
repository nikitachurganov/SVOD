from __future__ import annotations

import unittest

from app.constants import billing_plans as plans
from app.constants.billing_plans import (
    LIMIT_FIELDS,
    PLAN_RESEARCHER,
    PLAN_START,
    PLAN_UNLIMITED,
    PLANS,
    RESEARCHER,
    START,
    UNLIMITED,
    apply_overrides,
    get_plan,
)


class CatalogueTests(unittest.TestCase):
    def test_start_plan_matches_the_pricing_document(self):
        self.assertEqual(
            (
                START.max_active_surveys,
                START.max_projects,
                START.max_questions,
                START.responses_per_period,
                START.max_analyzed_responses,
                START.ai_actions_per_period,
            ),
            (3, 1, 20, 100, 100, 15),
        )
        self.assertEqual((START.price_month_kopecks, START.price_year_kopecks), (0, 0))

    def test_researcher_plan_matches_the_pricing_document(self):
        self.assertEqual(
            (
                RESEARCHER.max_active_surveys,
                RESEARCHER.max_projects,
                RESEARCHER.max_questions,
                RESEARCHER.responses_per_period,
                RESEARCHER.max_analyzed_responses,
                RESEARCHER.ai_actions_per_period,
            ),
            (20, 10, 50, 3_000, 3_000, 200),
        )
        # 790 roubles a month, the year is ten months
        self.assertEqual(RESEARCHER.price_month_kopecks, 79_000)
        self.assertEqual(RESEARCHER.price_year_kopecks, 790_000)

    def test_ai_budget_stays_around_fifteen_percent_of_the_price(self):
        self.assertLessEqual(RESEARCHER.ai_budget_rub_per_period * 100, RESEARCHER.price_month_kopecks * 0.16)

    def test_researcher_is_above_start_in_every_limit(self):
        for field in LIMIT_FIELDS:
            with self.subTest(field=field):
                self.assertGreater(getattr(RESEARCHER, field), getattr(START, field))

    def test_features_belong_to_the_paid_plan_only(self):
        self.assertEqual(START.features, frozenset())
        self.assertEqual(
            RESEARCHER.features,
            {
                plans.FEATURE_CROSSTABS,
                plans.FEATURE_CSV_EXPORT,
                plans.FEATURE_QUALITY_FILTER,
                plans.FEATURE_ALL_METHODOLOGIES,
            },
        )

    def test_catalogue_lists_the_two_plans_in_display_order(self):
        self.assertEqual(list(PLANS), [PLAN_START, PLAN_RESEARCHER])

    def test_unlimited_plan_cannot_be_stored_and_has_no_practical_limit(self):
        self.assertNotIn(PLAN_UNLIMITED, PLANS)
        self.assertEqual(UNLIMITED.features, RESEARCHER.features)
        for field in LIMIT_FIELDS:
            with self.subTest(field=field):
                self.assertGreater(getattr(UNLIMITED, field), 10**8)

    def test_course_pack_is_a_thirty_day_one_off(self):
        self.assertEqual((plans.COURSE_PACK_PRICE_KOPECKS, plans.COURSE_PACK_DAYS), (49_000, 30))


class GetPlanTests(unittest.TestCase):
    def test_known_codes(self):
        self.assertIs(get_plan("start"), START)
        self.assertIs(get_plan("researcher"), RESEARCHER)

    def test_unknown_missing_or_unstorable_codes_fall_back_to_the_free_plan(self):
        for code in (None, "", "gold", "RESEARCHER", PLAN_UNLIMITED):
            with self.subTest(code=code):
                self.assertIs(get_plan(code), START)


class ApplyOverridesTests(unittest.TestCase):
    def test_valid_limits_replace_the_plan_values(self):
        plan = apply_overrides(START, {"ai_actions_per_period": 500, "max_projects": 4})

        self.assertEqual((plan.ai_actions_per_period, plan.max_projects), (500, 4))
        self.assertEqual(plan.max_questions, START.max_questions)

    def test_zero_is_a_valid_limit(self):
        self.assertEqual(apply_overrides(START, {"ai_actions_per_period": 0}).ai_actions_per_period, 0)

    def test_nothing_to_apply_returns_the_same_plan(self):
        for overrides in (None, {}, {"unknown": 5}, [], "text"):
            with self.subTest(overrides=overrides):
                self.assertIs(apply_overrides(START, overrides), START)

    def test_bad_values_are_ignored(self):
        bad = {
            "ai_actions_per_period": -1,
            "max_projects": True,
            "max_questions": "50",
            "responses_per_period": 12.5,
            "max_active_surveys": None,
        }

        self.assertIs(apply_overrides(START, bad), START)

    def test_one_bad_value_does_not_cancel_the_good_ones(self):
        plan = apply_overrides(START, {"ai_actions_per_period": 40, "max_projects": -3})

        self.assertEqual(plan.ai_actions_per_period, 40)
        self.assertEqual(plan.max_projects, START.max_projects)

    def test_identity_prices_and_features_cannot_be_overridden(self):
        plan = apply_overrides(
            START,
            {"code": "researcher", "price_month_kopecks": 1, "features": ["csv_export"]},
        )

        self.assertIs(plan, START)


if __name__ == "__main__":
    unittest.main()
