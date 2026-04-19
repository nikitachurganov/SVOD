import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.request import Request
from app.repositories import request_repository
from app.services.gigachat_client import summarize_text
from app.services.request_ai_common import build_internal_author_name, build_label_map, format_value

logger = logging.getLogger(__name__)


def _build_prompt(req: Request) -> str:
    parts: list[str] = [
        "Request data:",
        f"Title: {req.title}",
        f"Status: {req.status}",
    ]

    if req.data and isinstance(req.data, dict):
        labels = build_label_map(req.form_snapshot)
        for key, value in req.data.items():
            if not value:
                continue
            parts.append(f"{labels.get(key, key)}: {format_value(value)}")

    author_name = build_internal_author_name(req)
    if author_name:
        parts.append(f"Author: {author_name}")

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
