"""The price of a team subscription: seats, the year, one 10 % discount. Pure arithmetic, no database.

The rules are the ones of docs/TARIFFS_FINAL.md (sections 4 and 8):

* the 1st seat (the creator) costs 690 ₽ a month, the 2nd and the 3rd 300 ₽ each (the kit of three is
  1 290 ₽), any other seat 420 ₽;
* a year costs 10.56 months instead of 12 (-12 %); each seat is rounded to whole rubles;
* at most one more discount of 10 % (a friend's referral or an ambassador's promo code) on top of the
  year, taken from the total and rounded to whole rubles;
* a seat added in the middle of a period is paid in proportion to the days that are left.

Money is integer kopecks everywhere. Nothing here knows about the user, the payment provider or the
clock: the callers pass in what they know (how many seats keep the kit price, how many days are left).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.constants.billing_plans import INTERVAL_MONTH, INTERVAL_YEAR

KOPECKS_IN_RUBLE = 100

SEAT_CREATOR_KOPECKS = 69_000
SEAT_KIT_KOPECKS = 30_000
SEAT_OTHER_KOPECKS = 42_000

# Seats in the kit, besides the creator
KIT_EXTRA_SEATS = 2
# Self-service up to this many seats; more goes by request and invoice
MAX_SELF_SERVICE_SEATS = 10

# A year is paid as 10.56 months: 1056 / 100 of the monthly price
_YEAR_NUMERATOR = 1056
_YEAR_DENOMINATOR = 100

DISCOUNT_REFERRAL = "referral"
DISCOUNT_PROMO = "promo"
DISCOUNTS = frozenset({DISCOUNT_REFERRAL, DISCOUNT_PROMO})
# One discount of this share of the total, never two
DISCOUNT_PERCENT = 10

SEAT_KIND_CREATOR = "creator"
SEAT_KIND_KIT = "kit"
SEAT_KIND_OTHER = "other"


@dataclass(frozen=True)
class SeatLine:
    position: int
    kind: str
    # What the seat costs for the whole period, after the year rule and before the 10 % discount
    price_kopecks: int


@dataclass(frozen=True)
class Quote:
    seats: int
    interval: str
    lines: tuple[SeatLine, ...]
    # The sum of the seats before the 10 % discount
    subtotal_kopecks: int
    discount: str | None
    discount_kopecks: int
    total_kopecks: int
    # What the year saves against twelve months at the monthly prices; 0 for a month
    year_saving_kopecks: int


def _round_to_ruble(kopecks_times_factor: int, denominator: int) -> int:
    """kopecks * factor / denominator, rounded half up to whole rubles, in kopecks."""
    unit = denominator * KOPECKS_IN_RUBLE
    return ((kopecks_times_factor + unit // 2) // unit) * KOPECKS_IN_RUBLE


def _seat_period_price(monthly_kopecks: int, interval: str) -> int:
    if interval == INTERVAL_YEAR:
        return _round_to_ruble(monthly_kopecks * _YEAR_NUMERATOR, _YEAR_DENOMINATOR)
    return monthly_kopecks


def seat_kinds(seats: int, kit_extra: int = KIT_EXTRA_SEATS) -> list[str]:
    """Which price each of the seats has: the creator, the kit (300 ₽) or any other (420 ₽).

    ``kit_extra`` is how many of the two kit places the team still has at the kit price: both when it
    buys for the first time, and after the 7-day window only as many as it held when the window ended.
    """
    if seats < 1:
        raise ValueError("A team has at least one seat")
    kit = max(0, min(kit_extra, KIT_EXTRA_SEATS, seats - 1))
    return [SEAT_KIND_CREATOR] + [SEAT_KIND_KIT] * kit + [SEAT_KIND_OTHER] * (seats - 1 - kit)


_MONTHLY_BY_KIND = {
    SEAT_KIND_CREATOR: SEAT_CREATOR_KOPECKS,
    SEAT_KIND_KIT: SEAT_KIT_KOPECKS,
    SEAT_KIND_OTHER: SEAT_OTHER_KOPECKS,
}


def quote(
    seats: int,
    interval: str,
    discount: str | None = None,
    *,
    kit_extra: int = KIT_EXTRA_SEATS,
) -> Quote:
    """The price of ``seats`` seats for one period (a month or a year).

    ``discount`` is one of DISCOUNTS or None. The year rule (-12 %) is part of the price of a seat and
    always applies to a year; the 10 % comes on top of it, once.
    """
    if interval not in (INTERVAL_MONTH, INTERVAL_YEAR):
        raise ValueError(f"Unknown billing interval: {interval}")
    if not 1 <= seats <= MAX_SELF_SERVICE_SEATS:
        raise ValueError(f"Seats must be from 1 to {MAX_SELF_SERVICE_SEATS}")
    if discount is not None and discount not in DISCOUNTS:
        raise ValueError(f"Unknown discount: {discount}")

    kinds = seat_kinds(seats, kit_extra)
    lines = tuple(
        SeatLine(
            position=i + 1, kind=kind, price_kopecks=_seat_period_price(_MONTHLY_BY_KIND[kind], interval)
        )
        for i, kind in enumerate(kinds)
    )
    subtotal = sum(line.price_kopecks for line in lines)
    discount_kopecks = (
        subtotal - _round_to_ruble(subtotal * (100 - DISCOUNT_PERCENT), 100) if discount else 0
    )
    year_saving = (
        sum(_MONTHLY_BY_KIND[kind] for kind in kinds) * 12 - subtotal if interval == INTERVAL_YEAR else 0
    )
    return Quote(
        seats=seats,
        interval=interval,
        lines=lines,
        subtotal_kopecks=subtotal,
        discount=discount,
        discount_kopecks=discount_kopecks,
        total_kopecks=subtotal - discount_kopecks,
        year_saving_kopecks=year_saving,
    )


def prorate(kopecks: int, days_left: int, period_days: int) -> int:
    """A part of a period's price for the days that are left, rounded half up to the kopeck."""
    if period_days <= 0:
        raise ValueError("A period has at least one day")
    days = max(0, min(days_left, period_days))
    return (kopecks * days * 2 + period_days) // (period_days * 2)


def seat_addition(
    seats_now: int,
    seats_after: int,
    interval: str,
    *,
    days_left: int,
    period_days: int,
    kit_extra_now: int = KIT_EXTRA_SEATS,
    kit_extra_after: int | None = None,
) -> int:
    """What to pay now for seats added in the middle of a period, in kopecks.

    The difference between the price of the period with the new seats and with the old ones, taken for
    the days that are left. Removing seats costs and returns nothing: it works from the next period.
    """
    if seats_after < seats_now:
        raise ValueError("Fewer seats take effect from the next period, nothing is charged now")
    after = KIT_EXTRA_SEATS if kit_extra_after is None else kit_extra_after
    before = quote(seats_now, interval, kit_extra=kit_extra_now).subtotal_kopecks
    full = quote(seats_after, interval, kit_extra=after).subtotal_kopecks
    return prorate(full - before, days_left, period_days)
