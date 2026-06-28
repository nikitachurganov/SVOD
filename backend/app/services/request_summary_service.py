import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.request import Request
from app.repositories import request_repository
from app.services.gigachat_client import summarize_text
from app.services.request_ai_common import (
    build_applicant_block,
    build_form_answers_text,
    build_internal_author_name,
)

logger = logging.getLogger(__name__)


def _build_prompt(req: Request) -> str:
    parts: list[str] = [
        "Request data:",
        f"Title: {req.title}",
        f"Status: {req.status}",
        f"Source: {req.source or 'internal'}",
    ]

    description = getattr(req, "applicant_description", None)
    if isinstance(description, str) and description.strip():
        parts.append(f"Applicant task description: {description.strip()}")

    parts.append("Form answers:")
    parts.append(build_form_answers_text(req))

    applicant = build_applicant_block(req)
    if applicant:
        parts.append(f"Applicant contacts:\n{applicant}")

    author_name = build_internal_author_name(req)
    if author_name:
        parts.append(f"Internal author: {author_name}")

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
