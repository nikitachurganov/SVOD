from __future__ import annotations

import unittest

from app.constants import billing_plans as plans
from app.constants.billing_plans import (
    LIMIT_FIELDS,
    PACK,
    PLAN_PACK,
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

# The limits on collecting data: none of them is a reason to stop a survey on any plan
COLLECTING_LIMITS = (
    "max_active_surveys",
    "max_projects",
    "max_questions",
    "responses_per_period",
    "max_analyzed_responses",
)


class CatalogueTests(unittest.TestCase):
    def test_collecting_data_is_never_limited(self):
        for plan in (START, PACK, RESEARCHER):
            for field in COLLECTING_LIMITS:
                with self.subTest(plan=plan.code, field=field):
                    self.assertGreater(getattr(plan, field), 10**8)

    def test_start_plan_matches_the_monetization_model(self):
        self.assertEqual(START.ai_tokens_per_period, 150_000)
        self.assertEqual(START.ai_window, plans.AI_WINDOW_LIFETIME)
        self.assertEqual((START.price_month_kopecks, START.price_year_kopecks), (0, 0))

    def test_pack_matches_the_monetization_model(self):
        self.assertEqual((plans.PACK_PRICE_KOPECKS, plans.PACK_DAYS), (25_000, 60))
        self.assertEqual(PACK.ai_tokens_per_period, 2_000_000)
        self.assertEqual(PACK.ai_window, plans.AI_WINDOW_PERIOD)

    def test_researcher_plan_matches_the_monetization_model(self):
        self.assertEqual(RESEARCHER.ai_tokens_per_period, 6_000_000)
        self.assertEqual(RESEARCHER.ai_window, plans.AI_WINDOW_MONTH)
        # 600 roubles a month, 5 400 a year (25 % off twelve months)
        self.assertEqual(RESEARCHER.price_month_kopecks, 60_000)
        self.assertEqual(RESEARCHER.price_year_kopecks, 540_000)
        self.assertEqual(RESEARCHER.price_year_kopecks, RESEARCHER.price_month_kopecks * 12 * 0.75)

    def test_the_more_a_plan_costs_the_more_tokens_it_has(self):
        self.assertLess(START.ai_tokens_per_period, PACK.ai_tokens_per_period)
        self.assertLess(PACK.ai_tokens_per_period, RESEARCHER.ai_tokens_per_period)

    def test_ai_stays_within_a_third_of_the_price_at_full_use(self):
        # 27.5 roubles per million tokens (docs/MONETIZATION_MODEL.md, 2.2)
        rub_per_million = 27.5
        for plan, price_kopecks in (
            (PACK, plans.PACK_PRICE_KOPECKS),
            (RESEARCHER, RESEARCHER.price_month_kopecks),
        ):
            with self.subTest(plan=plan.code):
                cost_kopecks = plan.ai_tokens_per_period / 1_000_000 * rub_per_million * 100
                self.assertLessEqual(cost_kopecks, price_kopecks * 0.34)

    def test_features_grow_with_the_plan(self):
        self.assertEqual(START.features, frozenset())
        self.assertEqual(PACK.features, {plans.FEATURE_CSV_EXPORT, plans.FEATURE_ALL_METHODOLOGIES})
        self.assertEqual(
            RESEARCHER.features,
            {
                plans.FEATURE_CROSSTABS,
                plans.FEATURE_CSV_EXPORT,
                plans.FEATURE_QUALITY_FILTER,
                plans.FEATURE_ALL_METHODOLOGIES,
            },
        )

    def test_catalogue_lists_the_plans_in_display_order(self):
        self.assertEqual(list(PLANS), [PLAN_START, PLAN_PACK, PLAN_RESEARCHER])

    def test_unlimited_plan_cannot_be_stored_and_has_no_practical_limit(self):
        self.assertNotIn(PLAN_UNLIMITED, PLANS)
        self.assertEqual(UNLIMITED.features, RESEARCHER.features)
        for field in LIMIT_FIELDS:
            with self.subTest(field=field):
                self.assertGreater(getattr(UNLIMITED, field), 10**8)


class GetPlanTests(unittest.TestCase):
    def test_known_codes(self):
        self.assertIs(get_plan("start"), START)
        self.assertIs(get_plan("pack"), PACK)
        self.assertIs(get_plan("researcher"), RESEARCHER)

    def test_unknown_missing_or_unstorable_codes_fall_back_to_the_free_plan(self):
        for code in (None, "", "gold", "RESEARCHER", PLAN_UNLIMITED):
            with self.subTest(code=code):
                self.assertIs(get_plan(code), START)


class ApplyOverridesTests(unittest.TestCase):
    def test_valid_limits_replace_the_plan_values(self):
        plan = apply_overrides(START, {"ai_tokens_per_period": 500_000, "max_projects": 4})

        self.assertEqual((plan.ai_tokens_per_period, plan.max_projects), (500_000, 4))
        self.assertEqual(plan.max_questions, START.max_questions)

    def test_zero_is_a_valid_limit(self):
        self.assertEqual(apply_overrides(START, {"ai_tokens_per_period": 0}).ai_tokens_per_period, 0)

    def test_nothing_to_apply_returns_the_same_plan(self):
        for overrides in (None, {}, {"unknown": 5}, [], "text"):
            with self.subTest(overrides=overrides):
                self.assertIs(apply_overrides(START, overrides), START)

    def test_bad_values_are_ignored(self):
        bad = {
            "ai_tokens_per_period": -1,
            "max_projects": True,
            "max_questions": "50",
            "responses_per_period": 12.5,
            "max_active_surveys": None,
        }

        self.assertIs(apply_overrides(START, bad), START)

    def test_limits_of_the_old_catalogue_are_dropped(self):
        # Overrides stored before the token allowance existed must not break or widen anything
        old = {"ai_actions_per_period": 500, "ai_budget_rub_per_period": 100}

        self.assertIs(apply_overrides(START, old), START)

    def test_one_bad_value_does_not_cancel_the_good_ones(self):
        plan = apply_overrides(START, {"ai_tokens_per_period": 40, "max_projects": -3})

        self.assertEqual(plan.ai_tokens_per_period, 40)
        self.assertEqual(plan.max_projects, START.max_projects)

    def test_identity_prices_and_features_cannot_be_overridden(self):
        plan = apply_overrides(
            START,
            {"code": "researcher", "price_month_kopecks": 1, "features": ["csv_export"]},
        )

        self.assertIs(plan, START)


if __name__ == "__main__":
    unittest.main()
