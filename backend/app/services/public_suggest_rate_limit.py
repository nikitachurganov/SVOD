"""Simple sliding-window rate limit for public suggest-forms (best-effort, process-local)."""

from __future__ import annotations

import time
from collections import defaultdict

_WINDOW_SEC = 60.0
_MAX_CALLS_PER_WINDOW = 40

_buckets: dict[str, list[float]] = defaultdict(list)


def check_public_suggest_limit(key: str) -> bool:
    now = time.monotonic()
    lst = _buckets[key]
    cutoff = now - _WINDOW_SEC
    while lst and lst[0] < cutoff:
        lst.pop(0)
    if len(lst) >= _MAX_CALLS_PER_WINDOW:
        return False
    lst.append(now)
    return True
