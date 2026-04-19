import json
import logging

import httpx

from app.core.config import settings
from app.services.gigachat_auth import get_access_token

logger = logging.getLogger(__name__)

_COMPLETIONS_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"

_FALLBACK_RESULT = {"summary": "", "priority": "medium", "tags": []}


async def post_chat_completion(
    messages: list[dict[str, str]],
    *,
    max_tokens: int = 512,
    temperature: float = 0.2,
) -> str:
    """Call GigaChat chat/completions and return assistant message text."""
    token = await get_access_token()
    body = {
        "model": settings.GIGACHAT_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(verify=False) as client:
        response = await client.post(
            _COMPLETIONS_URL,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
            },
            json=body,
            timeout=60.0,
        )
        response.raise_for_status()

    data = response.json()
    content = data["choices"][0]["message"]["content"]
    logger.debug("GigaChat raw response: %s", content)
    return content


async def summarize_text(text: str) -> dict:
    """Send text to GigaChat and return parsed JSON response."""
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
                '{"summary": "Запрос на ...", "priority": "medium", "tags": ["ИТ", "доступ"]}'
            ),
        },
        {
            "role": "user",
            "content": text,
        },
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
        logger.warning("GigaChat returned non-JSON response, using fallback: %s", cleaned[:300])
        return {**_FALLBACK_RESULT, "summary": cleaned[:500]}

    if not isinstance(parsed, dict):
        logger.warning("GigaChat returned non-object JSON, using fallback")
        return {**_FALLBACK_RESULT, "summary": str(parsed)[:500]}

    return {
        "summary": parsed.get("summary", ""),
        "priority": parsed.get("priority", "medium")
        if parsed.get("priority") in ("low", "medium", "high")
        else "medium",
        "tags": parsed.get("tags", []) if isinstance(parsed.get("tags"), list) else [],
    }
