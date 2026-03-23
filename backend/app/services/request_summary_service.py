import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.request import Request
from app.repositories import request_repository
from app.services.gigachat_client import summarize_text

logger = logging.getLogger(__name__)


def _format_value(value: object) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _build_label_map(form_snapshot: dict | None) -> dict[str, str]:
    """Map field ids to human-readable labels from the snapshot attached to the request."""
    if not form_snapshot:
        return {}
    fields = form_snapshot if isinstance(form_snapshot, list) else form_snapshot.get("fields", [])
    return {
        f["id"]: f.get("label", f.get("name", f["id"]))
        for f in fields
        if isinstance(f, dict) and "id" in f
    }


def _build_prompt(req: Request) -> str:
    parts: list[str] = [
        "Request data:",
        f"Title: {req.title}",
        f"Status: {req.status}",
    ]

    if req.data and isinstance(req.data, dict):
        labels = _build_label_map(req.form_snapshot)
        for key, value in req.data.items():
            if not value:
                continue
            parts.append(f"{labels.get(key, key)}: {_format_value(value)}")

    if req.author:
        name = " ".join(
            filter(None, [req.author.last_name, req.author.first_name, req.author.middle_name])
        )
        if name:
            parts.append(f"Author: {name}")

    return "\n".join(parts)


async def generate_summary(session: AsyncSession, request_id: int) -> dict:
    """Generate an AI summary for the given request, persist it, and return the result."""
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise ValueError(f"Request {request_id} not found")

    prompt = _build_prompt(req)
    logger.info("Generating AI summary for request %s", request_id)

    result = await summarize_text(prompt)

    summary_data = {
        "summary": result.get("summary", ""),
        "priority": result.get("priority", "medium"),
        "tags": result.get("tags", []),
    }

    req.ai_summary = summary_data
    await request_repository.update(session, req)
    await session.commit()

    logger.info("AI summary generated successfully for request %s", request_id)
    return summary_data


async def get_summary(session: AsyncSession, request_id: int) -> dict | None:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise ValueError(f"Request {request_id} not found")
    return req.ai_summary
