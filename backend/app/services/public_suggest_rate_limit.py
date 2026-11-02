"""Simple sliding-window rate limit for public endpoints (best-effort, process-local)."""

from __future__ import annotations

import time
from collections import defaultdict

_WINDOW_SEC = 180.0
_MAX_CALLS_PER_WINDOW = 40

_buckets: dict[str, list[float]] = defaultdict(list)


def check_limit(key: str, *, window_sec: float, max_calls: int) -> bool:
    """Count the call under ``key``; False when ``max_calls`` were already made in the window."""
    now = time.monotonic()
    lst = _buckets[key]
    cutoff = now - window_sec
    while lst and lst[0] < cutoff:
        lst.pop(0)
    if len(lst) >= max_calls:
        return False
    lst.append(now)
    return True


def check_public_suggest_limit(key: str) -> bool:
    return check_limit(key, window_sec=_WINDOW_SEC, max_calls=_MAX_CALLS_PER_WINDOW)
