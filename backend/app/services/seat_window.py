"""The 7-day window after the first payment, and which seats still cost the kit price.

docs/TARIFFS_FINAL.md section 4.3: a team that buys fewer than three seats can take a removed seat
back at 300 ₽ for 7 days after the first payment, once. After the window every extra seat above
what the team kept costs 420 ₽, and removing a seat at a renewal gives up its kit place.

Pure functions over the subscription row; they only read and set its fields.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Protocol

from app.services.pricing import KIT_EXTRA_SEATS

SEAT_WINDOW_DAYS = 7


class _SeatState(Protocol):
    seats_count: int
    seat_window_ends_at: datetime | None
    first_paid_at: datetime | None
    kit_extra_seats: int


def window_open(sub: _SeatState | None, now: datetime) -> bool:
    return sub is not None and sub.seat_window_ends_at is not None and now <= sub.seat_window_ends_at


def kit_extra_for(sub: _SeatState | None, now: datetime) -> int:
    """How many of the two kit places the next purchase prices at 300 ₽."""
    if sub is None or sub.first_paid_at is None or window_open(sub, now):
        return KIT_EXTRA_SEATS
    return max(0, min(sub.kit_extra_seats, KIT_EXTRA_SEATS))


def days_left(sub: _SeatState | None, now: datetime) -> int:
    """Whole days left in the window, for the counter in the cabinet (0 when it is closed)."""
    if sub is None or sub.seat_window_ends_at is None or not window_open(sub, now):
        return 0
    remaining = sub.seat_window_ends_at - now
    return remaining.days + (1 if remaining % timedelta(days=1) else 0)


def record_paid_seats(sub: _SeatState, seats: int, now: datetime) -> None:
    """A payment for ``seats`` seats has been applied: remember the seats, open the window once."""
    if sub.first_paid_at is None:
        sub.first_paid_at = now
        sub.kit_extra_seats = KIT_EXTRA_SEATS
        # Only a team that left a kit place empty has something to take back
        sub.seat_window_ends_at = (
            now + timedelta(days=SEAT_WINDOW_DAYS) if seats - 1 < KIT_EXTRA_SEATS else None
        )
    elif not window_open(sub, now):
        # The window is over (it never reopens): a place the team does not keep is given up
        sub.kit_extra_seats = max(0, min(sub.kit_extra_seats, seats - 1))
    sub.seats_count = seats
