"""What the LLM calls of one AI action used.

openrouter_client reports every response here and ai_meter reads the total, so no function in
between needs a new argument. The collector lives in a ContextVar; outside an ai_meter action
nothing is collected (requests, Telegram and the other AI paths are not metered yet).
"""

from __future__ import annotations

import contextvars
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from app.core.config import settings

_PER_MILLION = Decimal(1_000_000)


@dataclass
class UsageCollector:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: Decimal = Decimal(0)
    model: str | None = None


_current: contextvars.ContextVar[UsageCollector | None] = contextvars.ContextVar(
    "ai_usage_collector", default=None
)


def activate(collector: UsageCollector) -> contextvars.Token:
    return _current.set(collector)


def deactivate(token: contextvars.Token) -> None:
    _current.reset(token)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0


def _count(value: Any) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def estimate_cost_usd(prompt_tokens: int, completion_tokens: int) -> Decimal:
    """Cost by the token prices from the settings, for responses that did not report it."""
    price_in = Decimal(str(settings.OPENROUTER_PRICE_IN_USD_PER_M))
    price_out = Decimal(str(settings.OPENROUTER_PRICE_OUT_USD_PER_M))
    return (prompt_tokens * price_in + completion_tokens * price_out) / _PER_MILLION


def record(usage: Any, model: str | None) -> None:
    """Called by the OpenRouter client after every response; does nothing outside a metered action.

    A missing or broken ``usage`` still counts as a call: the request was made and paid for.
    """
    collector = _current.get()
    if collector is None:
        return
    usage = usage if isinstance(usage, dict) else {}
    prompt = _count(usage.get("prompt_tokens"))
    completion = _count(usage.get("completion_tokens"))
    reported = usage.get("cost")
    cost = Decimal(str(reported)) if _is_number(reported) else estimate_cost_usd(prompt, completion)
    collector.calls += 1
    collector.prompt_tokens += prompt
    collector.completion_tokens += completion
    collector.cost_usd += cost
    if model:
        collector.model = model
