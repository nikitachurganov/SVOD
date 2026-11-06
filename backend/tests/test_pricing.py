"""The price list of docs/TARIFFS_FINAL.md, figure by figure (sections 4 and 8)."""

from __future__ import annotations

import unittest

from app.constants.billing_plans import INTERVAL_MONTH, INTERVAL_YEAR
from app.services import pricing

RUB = 100


class MonthlyPriceTests(unittest.TestCase):
    def test_the_table_of_configurations(self):
        # seats -> rubles a month (section 4.2)
        for seats, rubles in {1: 600, 2: 900, 3: 1200, 4: 1620}.items():
            with self.subTest(seats=seats):
                self.assertEqual(pricing.quote(seats, INTERVAL_MONTH).total_kopecks, rubles * RUB)

    def test_each_seat_has_its_own_price(self):
        lines = pricing.quote(4, INTERVAL_MONTH).lines

        self.assertEqual(
            [(line.kind, line.price_kopecks // RUB) for line in lines],
            [("creator", 600), ("kit", 300), ("kit", 300), ("other", 420)],
        )

    def test_ten_seats_is_the_self_service_ceiling(self):
        self.assertEqual(pricing.quote(10, INTERVAL_MONTH).total_kopecks, (600 + 600 + 7 * 420) * RUB)


class YearlyPriceTests(unittest.TestCase):
    def test_the_table_of_configurations(self):
        for seats, rubles in {1: 6336, 2: 9504, 3: 12672, 4: 17107}.items():
            with self.subTest(seats=seats):
                self.assertEqual(pricing.quote(seats, INTERVAL_YEAR).total_kopecks, rubles * RUB)

    def test_each_seat_is_rounded_to_whole_rubles(self):
        lines = pricing.quote(4, INTERVAL_YEAR).lines

        self.assertEqual(
            [line.price_kopecks // RUB for line in lines], [6336, 3168, 3168, 4435]
        )
        self.assertTrue(all(line.price_kopecks % RUB == 0 for line in lines))

    def test_the_year_saves_twelve_percent(self):
        q = pricing.quote(3, INTERVAL_YEAR)

        # 12 months at 1 200 = 14 400; the year costs 12 672
        self.assertEqual(q.year_saving_kopecks, (14_400 - 12_672) * RUB)

    def test_a_month_saves_nothing(self):
        self.assertEqual(pricing.quote(3, INTERVAL_MONTH).year_saving_kopecks, 0)


class DiscountTests(unittest.TestCase):
    def test_a_promo_on_a_year_of_three_seats(self):
        q = pricing.quote(3, INTERVAL_YEAR, pricing.DISCOUNT_PROMO)

        self.assertEqual(q.subtotal_kopecks, 12_672 * RUB)
        self.assertEqual(q.total_kopecks, 11_405 * RUB)
        self.assertEqual(q.discount_kopecks, (12_672 - 11_405) * RUB)

    def test_a_referral_on_a_month(self):
        q = pricing.quote(3, INTERVAL_MONTH, pricing.DISCOUNT_REFERRAL)

        self.assertEqual(q.total_kopecks, 1_080 * RUB)

    def test_both_discounts_are_the_same_ten_percent(self):
        promo = pricing.quote(2, INTERVAL_YEAR, pricing.DISCOUNT_PROMO)
        referral = pricing.quote(2, INTERVAL_YEAR, pricing.DISCOUNT_REFERRAL)

        self.assertEqual(promo.total_kopecks, referral.total_kopecks)

    def test_no_discount_leaves_the_subtotal(self):
        q = pricing.quote(3, INTERVAL_YEAR)

        self.assertEqual((q.discount, q.discount_kopecks, q.total_kopecks), (None, 0, q.subtotal_kopecks))


class KitWindowTests(unittest.TestCase):
    def test_a_seat_returned_in_the_window_keeps_the_kit_price(self):
        # Bought with two, the third comes back within 7 days: both extras are still at 300
        self.assertEqual(pricing.quote(3, INTERVAL_MONTH, kit_extra=2).total_kopecks, 1_200 * RUB)

    def test_after_the_window_only_the_kept_seat_has_the_kit_price(self):
        # The window closed when the team had two seats: one extra at 300, the next at 420
        q = pricing.quote(3, INTERVAL_MONTH, kit_extra=1)

        self.assertEqual(q.total_kopecks, (600 + 300 + 420) * RUB)
        self.assertEqual([line.kind for line in q.lines], ["creator", "kit", "other"])

    def test_with_no_kit_left_every_extra_seat_is_420(self):
        self.assertEqual(pricing.quote(2, INTERVAL_MONTH, kit_extra=0).total_kopecks, (600 + 420) * RUB)

    def test_the_kit_never_covers_more_than_two_extras(self):
        self.assertEqual(pricing.seat_kinds(5, kit_extra=9).count("kit"), 2)


class ProrationTests(unittest.TestCase):
    def test_half_of_the_period_costs_half(self):
        self.assertEqual(pricing.prorate(120_000, 15, 30), 60_000)

    def test_rounding_goes_to_the_nearest_kopeck_and_halves_go_up(self):
        self.assertEqual(pricing.prorate(100, 1, 3), 33)
        self.assertEqual(pricing.prorate(1, 1, 2), 1)

    def test_days_are_kept_inside_the_period(self):
        self.assertEqual(pricing.prorate(1_000, 99, 30), 1_000)
        self.assertEqual(pricing.prorate(1_000, -3, 30), 0)

    def test_a_third_seat_in_the_middle_of_a_month(self):
        # 300 ₽ for the month, half of it is left
        got = pricing.seat_addition(2, 3, INTERVAL_MONTH, days_left=15, period_days=30)

        self.assertEqual(got, 150 * RUB)

    def test_a_fourth_seat_for_a_whole_year_is_the_yearly_price(self):
        got = pricing.seat_addition(3, 4, INTERVAL_YEAR, days_left=365, period_days=365)

        self.assertEqual(got, 4_435 * RUB)

    def test_a_seat_after_the_window_costs_420(self):
        got = pricing.seat_addition(
            2, 3, INTERVAL_MONTH, days_left=30, period_days=30, kit_extra_now=1, kit_extra_after=1
        )

        self.assertEqual(got, 420 * RUB)

    def test_no_seats_added_costs_nothing(self):
        self.assertEqual(pricing.seat_addition(3, 3, INTERVAL_MONTH, days_left=10, period_days=30), 0)

    def test_fewer_seats_are_not_charged_now(self):
        with self.assertRaises(ValueError):
            pricing.seat_addition(3, 2, INTERVAL_MONTH, days_left=10, period_days=30)


class ValidationTests(unittest.TestCase):
    def test_seats_out_of_range(self):
        for seats in (0, -1, pricing.MAX_SELF_SERVICE_SEATS + 1):
            with self.subTest(seats=seats), self.assertRaises(ValueError):
                pricing.quote(seats, INTERVAL_MONTH)

    def test_unknown_interval(self):
        for interval in ("none", "one_off", "week"):
            with self.subTest(interval=interval), self.assertRaises(ValueError):
                pricing.quote(3, interval)

    def test_unknown_discount(self):
        with self.assertRaises(ValueError):
            pricing.quote(3, INTERVAL_YEAR, "friday")

    def test_a_period_needs_days(self):
        with self.assertRaises(ValueError):
            pricing.prorate(100, 1, 0)


if __name__ == "__main__":
    unittest.main()
