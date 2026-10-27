import json
import logging

import httpx

from app.core.config import settings
from app.services import ai_usage

logger = logging.getLogger(__name__)

_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"
_FALLBACK_RESULT = {"summary": "", "priority": "medium", "tags": []}


async def post_chat_completion(
    messages: list[dict[str, str]],
    *,
    max_tokens: int = 512,
    temperature: float = 0.2,
    timeout: float = 60.0,
) -> str:
    """Call OpenRouter's OpenAI-compatible chat completions API.

    Reasoning models may spend the whole ``max_tokens`` budget on hidden reasoning and
    return an empty answer (finish_reason=length); in that case retry once with a doubled budget.
    """
    try:
        return await _request_completion(messages, max_tokens, temperature, timeout)
    except _TruncatedCompletion:
        logger.warning("OpenRouter completion was truncated at %s tokens, retrying", max_tokens)
        try:
            return await _request_completion(messages, max_tokens * 2, temperature, timeout)
        except _TruncatedCompletion as exc:
            raise RuntimeError(str(exc)) from exc


class _TruncatedCompletion(RuntimeError):
    pass


async def _request_completion(
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float,
    timeout: float,
) -> str:
    body: dict = {
        "model": settings.OPENROUTER_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    effort = settings.OPENROUTER_REASONING_EFFORT.strip()
    if effort:
        body["reasoning"] = {"effort": effort, "exclude": True}

    async with httpx.AsyncClient() as client:
        response = await client.post(
            _COMPLETIONS_URL,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            },
            json=body,
            timeout=timeout,
        )
        response.raise_for_status()

    data = response.json()
    if isinstance(data, dict):
        # Counted before the answer is checked: a truncated or empty completion was still paid for
        ai_usage.record(data.get("usage"), data.get("model") or settings.OPENROUTER_MODEL)
    try:
        choice = data["choices"][0]
        content = choice["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("OpenRouter returned an invalid completion payload") from exc

    finish_reason = choice.get("finish_reason", "unknown")
    if finish_reason == "length":
        # All our prompts expect complete JSON — a cut-off answer is unusable
        raise _TruncatedCompletion("OpenRouter completion was truncated (finish_reason=length)")

    if not isinstance(content, str) or not content.strip():
        raise RuntimeError(
            f"OpenRouter returned an empty completion (finish_reason={finish_reason})"
        )

    logger.debug("OpenRouter raw response: %s", content)
    return content


async def summarize_text(text: str) -> dict:
    """Send text to OpenRouter and return a parsed JSON response."""
    messages = [
        {
            "role": "system",
            "content": (
                "You are an assistant that analyzes user requests submitted through a service desk. "
                "You must respond ONLY with valid JSON (no markdown, no extra text). "
                "The JSON must have exactly three keys:\n"
                '  "summary" — a short summary of the request in Russian (1-3 sentences),\n'
                '  "priority" — one of "low", "medium", or "high",\n'
                '  "tags" — a list of 1-5 short keyword tags in Russian.\n'
                "Example: "
                '{"summary": "Запрос на предоставление доступа", "priority": "medium", "tags": ["ИТ", "доступ"]}'
            ),
        },
        {"role": "user", "content": text},
    ]

    content = await post_chat_completion(messages, max_tokens=512, temperature=0.2)
    return _parse_summary_response(content)


def strip_json_fence(content: str) -> str:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        cleaned = cleaned.rsplit("```", 1)[0]
    return cleaned.strip()


def _parse_summary_response(content: str) -> dict:
    """Parse the model response as JSON, falling back gracefully on malformed output."""
    cleaned = strip_json_fence(content)

    try:
        parsed = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        logger.warning("OpenRouter returned non-JSON response, using fallback: %s", cleaned[:300])
        return {**_FALLBACK_RESULT, "summary": cleaned[:500]}

    if not isinstance(parsed, dict):
        logger.warning("OpenRouter returned non-object JSON, using fallback")
        return {**_FALLBACK_RESULT, "summary": str(parsed)[:500]}

    return {
        "summary": parsed.get("summary", ""),
        "priority": parsed.get("priority", "medium")
        if parsed.get("priority") in ("low", "medium", "high")
        else "medium",
        "tags": parsed.get("tags", []) if isinstance(parsed.get("tags"), list) else [],
    }
