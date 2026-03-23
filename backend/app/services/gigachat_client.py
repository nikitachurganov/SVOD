import json
import logging

import httpx

from app.core.config import settings
from app.services.gigachat_auth import get_access_token

logger = logging.getLogger(__name__)

_COMPLETIONS_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"

_FALLBACK_RESULT = {"summary": "", "priority": "medium", "tags": []}


async def summarize_text(text: str) -> dict:
    """Send text to GigaChat and return parsed JSON response."""
    token = await get_access_token()

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

    body = {
        "model": settings.GIGACHAT_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 512,
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

    return _parse_response(content)


def _parse_response(content: str) -> dict:
    """Parse the model response as JSON, falling back gracefully on malformed output."""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        cleaned = cleaned.rsplit("```", 1)[0]

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
        "priority": parsed.get("priority", "medium") if parsed.get("priority") in ("low", "medium", "high") else "medium",
        "tags": parsed.get("tags", []) if isinstance(parsed.get("tags"), list) else [],
    }
