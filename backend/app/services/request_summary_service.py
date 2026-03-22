import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.request import Request
from app.repositories import request_repository
from app.services.gigachat_client import summarize_text

logger = logging.getLogger(__name__)

_RELEVANT_DATA_KEYS = {"full_name", "request_type", "description", "comment"}


def _build_prompt(req: Request) -> str:
    parts: list[str] = [
        (
            "You are an assistant that summarizes a service desk request.\n"
            "Generate the summary in Russian.\n"
            'The value of "summary" MUST start with the word "SUCCESS".\n'
            "Return strictly valid JSON only, with no additional text outside JSON.\n"
            "Expected format:\n"
            '{\n'
            '  "summary": "SUCCESS ...",\n'
            '  "priority": "low|medium|high",\n'
            '  "tags": ["tag1", "tag2"]\n'
            "}\n"
        ),
        "Request data:",
        f"Title: {req.title}",
        f"Status: {req.status}",
    ]

    if req.data and isinstance(req.data, dict):
        field_labels = _build_label_map(req.form_snapshot)
        for key, value in req.data.items():
            if not value:
                continue
            label = field_labels.get(key, key)
            parts.append(f"{label}: {value}")

    if req.author:
        author_name = " ".join(
            filter(None, [req.author.last_name, req.author.first_name, req.author.middle_name])
        )
        if author_name:
            parts.append(f"Author: {author_name}")

    return "\n".join(parts)


def _build_label_map(form_snapshot: dict | None) -> dict[str, str]:
    """Extract {field_id: label} from form_snapshot fields list."""
    if not form_snapshot:
        return {}
    fields = form_snapshot if isinstance(form_snapshot, list) else form_snapshot.get("fields", [])
    mapping: dict[str, str] = {}
    for field in fields:
        if isinstance(field, dict) and "id" in field:
            mapping[field["id"]] = field.get("label", field.get("name", field["id"]))
    return mapping


async def generate_summary(session: AsyncSession, request_id: int) -> dict:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise ValueError(f"Request {request_id} not found")

    prompt_text = _build_prompt(req)
    logger.info("Generating AI summary for request %s", request_id)

    result = await summarize_text(prompt_text)

    summary_data = {
        "summary": result.get("summary", ""),
        "priority": result.get("priority", "medium"),
        "tags": result.get("tags", []),
    }

    req.ai_summary = summary_data
    await request_repository.update(session, req)
    await session.commit()

    return summary_data


async def get_summary(session: AsyncSession, request_id: int) -> dict | None:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise ValueError(f"Request {request_id} not found")
    return req.ai_summary
