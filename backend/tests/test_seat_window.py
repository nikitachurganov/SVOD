from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services import seat_window

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
DAY = timedelta(days=1)


def sub(**overrides):
    data = dict(seats_count=1, seat_window_ends_at=None, first_paid_at=None, kit_extra_seats=2)
    data.update(overrides)
    return SimpleNamespace(**data)


class FirstPaymentTests(unittest.TestCase):
    def test_a_team_that_left_a_kit_place_empty_gets_the_window(self):
        for seats in (1, 2):
            with self.subTest(seats=seats):
                row = sub()
                seat_window.record_paid_seats(row, seats, NOW)
                self.assertEqual(row.first_paid_at, NOW)
                self.assertEqual(row.seat_window_ends_at, NOW + 7 * DAY)
                self.assertEqual((row.seats_count, row.kit_extra_seats), (seats, 2))

    def test_a_team_with_the_whole_kit_needs_no_window(self):
        for seats in (3, 4, 10):
            with self.subTest(seats=seats):
                row = sub()
                seat_window.record_paid_seats(row, seats, NOW)
                self.assertEqual(row.first_paid_at, NOW)
                self.assertIsNone(row.seat_window_ends_at)
                self.assertEqual((row.seats_count, row.kit_extra_seats), (seats, 2))


class LaterPaymentTests(unittest.TestCase):
    def test_a_payment_inside_the_window_keeps_the_kit_places(self):
        row = sub(first_paid_at=NOW, seat_window_ends_at=NOW + 7 * DAY, seats_count=3)

        seat_window.record_paid_seats(row, 1, NOW + 3 * DAY)

        self.assertEqual((row.seats_count, row.kit_extra_seats), (1, 2))
        self.assertEqual(row.seat_window_ends_at, NOW + 7 * DAY)

    def test_after_the_window_a_removed_place_is_given_up(self):
        row = sub(first_paid_at=NOW, seat_window_ends_at=NOW + 7 * DAY, seats_count=3)

        seat_window.record_paid_seats(row, 2, NOW + 30 * DAY)

        self.assertEqual((row.seats_count, row.kit_extra_seats), (2, 1))

    def test_the_window_never_reopens(self):
        row = sub(first_paid_at=NOW, seat_window_ends_at=NOW + 7 * DAY, seats_count=1)
        later = NOW + 40 * DAY

        seat_window.record_paid_seats(row, 1, later)
        seat_window.record_paid_seats(row, 5, later + 30 * DAY)

        self.assertEqual(row.seat_window_ends_at, NOW + 7 * DAY)
        self.assertEqual(row.first_paid_at, NOW)

    def test_an_unused_place_is_not_lost_by_growing(self):
        row = sub(first_paid_at=NOW, seat_window_ends_at=None, seats_count=3, kit_extra_seats=2)

        seat_window.record_paid_seats(row, 5, NOW + 30 * DAY)

        self.assertEqual((row.seats_count, row.kit_extra_seats), (5, 2))

    def test_the_kit_never_goes_below_zero(self):
        row = sub(first_paid_at=NOW, seat_window_ends_at=None, seats_count=3, kit_extra_seats=2)

        seat_window.record_paid_seats(row, 1, NOW + 30 * DAY)

        self.assertEqual((row.seats_count, row.kit_extra_seats), (1, 0))


class KitExtraForTests(unittest.TestCase):
    def test_a_team_that_never_paid_has_the_whole_kit(self):
        self.assertEqual(seat_window.kit_extra_for(None, NOW), 2)
        self.assertEqual(seat_window.kit_extra_for(sub(), NOW), 2)

    def test_inside_the_window_the_whole_kit_is_still_there(self):
        row = sub(first_paid_at=NOW, seat_window_ends_at=NOW + 7 * DAY, kit_extra_seats=0)
        self.assertEqual(seat_window.kit_extra_for(row, NOW + 6 * DAY), 2)

    def test_after_the_window_only_what_was_kept(self):
        row = sub(first_paid_at=NOW, seat_window_ends_at=NOW + 7 * DAY, kit_extra_seats=1)
        self.assertEqual(seat_window.kit_extra_for(row, NOW + 8 * DAY), 1)

    def test_a_damaged_value_is_clamped(self):
        for stored, expected in ((-3, 0), (9, 2)):
            with self.subTest(stored=stored):
                row = sub(first_paid_at=NOW, kit_extra_seats=stored)
                self.assertEqual(seat_window.kit_extra_for(row, NOW + 30 * DAY), expected)


class DaysLeftTests(unittest.TestCase):
    def test_no_window_no_days(self):
        self.assertEqual(seat_window.days_left(None, NOW), 0)
        self.assertEqual(seat_window.days_left(sub(), NOW), 0)

    def test_a_started_day_counts_as_a_day(self):
        row = sub(first_paid_at=NOW, seat_window_ends_at=NOW + 7 * DAY)
        self.assertEqual(seat_window.days_left(row, NOW), 7)
        self.assertEqual(seat_window.days_left(row, NOW + 6 * DAY + timedelta(hours=1)), 1)

    def test_the_last_moment_is_still_inside_and_the_next_one_is_not(self):
        row = sub(first_paid_at=NOW, seat_window_ends_at=NOW + 7 * DAY)
        self.assertTrue(seat_window.window_open(row, NOW + 7 * DAY))
        self.assertFalse(seat_window.window_open(row, NOW + 7 * DAY + timedelta(seconds=1)))
        self.assertEqual(seat_window.days_left(row, NOW + 8 * DAY), 0)


if __name__ == "__main__":
    unittest.main()
