"""Small statistics helpers on the standard library (no numpy / scipy).

Only what the survey analytics need: descriptive statistics and the chi-square test of
independence. The chi-square tail probability is computed through the regularised upper
incomplete gamma function (series for small x, Lentz continued fraction otherwise).
"""

from __future__ import annotations

import math
from collections import Counter

_EPS = 1e-12
_MAX_ITER = 500


def mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def mode(values: list[float]) -> float | None:
    """Most frequent value; the smallest one wins a tie."""
    if not values:
        return None
    counts = Counter(values)
    top = max(counts.values())
    return min(v for v, c in counts.items() if c == top)


def sample_std(values: list[float]) -> float | None:
    """Sample standard deviation (n - 1); None for fewer than two values."""
    if len(values) < 2:
        return None
    m = sum(values) / len(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / (len(values) - 1))


def _gamma_q(a: float, x: float) -> float:
    """Regularised upper incomplete gamma function Q(a, x)."""
    if x <= 0:
        return 1.0
    if x < a + 1:
        # Series for P(a, x), Q = 1 - P
        term = 1.0 / a
        total = term
        ap = a
        for _ in range(_MAX_ITER):
            ap += 1
            term *= x / ap
            total += term
            if abs(term) < abs(total) * _EPS:
                break
        p = total * math.exp(-x + a * math.log(x) - math.lgamma(a))
        return max(0.0, min(1.0, 1.0 - p))
    # Continued fraction for Q(a, x) (modified Lentz)
    tiny = 1e-300
    b = x + 1 - a
    c = 1 / tiny
    d = 1 / b
    h = d
    for i in range(1, _MAX_ITER):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        if abs(d) < tiny:
            d = tiny
        c = b + an / c
        if abs(c) < tiny:
            c = tiny
        d = 1 / d
        delta = d * c
        h *= delta
        if abs(delta - 1) < _EPS:
            break
    q = math.exp(-x + a * math.log(x) - math.lgamma(a)) * h
    return max(0.0, min(1.0, q))


def chi2_sf(x: float, dof: int) -> float:
    """P(X >= x) for the chi-square distribution with ``dof`` degrees of freedom."""
    if dof <= 0:
        return 1.0
    return _gamma_q(dof / 2, x / 2)


class ChiSquareResult:
    __slots__ = ("chi2", "dof", "p_value", "cramers_v", "low_expected_share")

    def __init__(
        self, chi2: float, dof: int, p_value: float, cramers_v: float, low_expected_share: float
    ) -> None:
        self.chi2 = chi2
        self.dof = dof
        self.p_value = p_value
        self.cramers_v = cramers_v
        self.low_expected_share = low_expected_share


def chi_square_independence(table: list[list[int]]) -> ChiSquareResult | None:
    """Pearson chi-square test of independence; empty rows / columns are ignored.

    Returns None when the table is degenerate (fewer than 2 non-empty rows or columns).
    ``low_expected_share`` is the share of cells with an expected count below 5 — when it
    is above ~20 % the test is unreliable and the UI warns about it.
    """
    rows = [r for r in table if sum(r) > 0]
    if len(rows) < 2:
        return None
    n_cols = len(rows[0])
    keep = [j for j in range(n_cols) if sum(r[j] for r in rows) > 0]
    if len(keep) < 2:
        return None
    grid = [[r[j] for j in keep] for r in rows]
    row_tot = [sum(r) for r in grid]
    col_tot = [sum(r[j] for r in grid) for j in range(len(keep))]
    total = sum(row_tot)
    chi2 = 0.0
    low = 0
    for i, r in enumerate(grid):
        for j, observed in enumerate(r):
            expected = row_tot[i] * col_tot[j] / total
            if expected < 5:
                low += 1
            chi2 += (observed - expected) ** 2 / expected
    dof = (len(grid) - 1) * (len(keep) - 1)
    k = min(len(grid), len(keep)) - 1
    cramers_v = math.sqrt(chi2 / (total * k)) if k > 0 else 0.0
    return ChiSquareResult(
        chi2=chi2,
        dof=dof,
        p_value=chi2_sf(chi2, dof),
        cramers_v=min(1.0, cramers_v),
        low_expected_share=low / (len(grid) * len(keep)),
    )
