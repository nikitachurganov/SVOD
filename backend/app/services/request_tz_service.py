"""Generate and update technical specification (ТЗ) for requests."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.request import Request
from app.models.user import User
from app.repositories import organization_repository, request_repository
from app.schemas.request_tz import (
    PatchRequestTZPayload,
    RequestTZResponse,
    RequestTZSections,
    RequestTZStored,
)
from app.services.gigachat_client import post_chat_completion
from app.services.request_tz_parser import parse_tz_llm_json
from app.services.request_tz_prompt_builder import build_tz_messages

logger = logging.getLogger(__name__)


def format_ai_tz_plain_text(req: Request) -> str | None:
    """Human-readable ТЗ text for logs / future email (used when sending to performer)."""
    tz = req.ai_tz
    if not tz or not isinstance(tz, dict):
        return None
    sec = tz.get("sections") if isinstance(tz.get("sections"), dict) else {}

    def lines_for(label: str, key: str, *, as_list: bool = False) -> list[str]:
        val = sec.get(key)
        out = [label]
        if as_list:
            items = val if isinstance(val, list) else ([] if val is None else [str(val)])
            for item in items:
                if str(item).strip():
                    out.append(f"  • {item}")
        else:
            if val is None or (isinstance(val, str) and not val.strip()):
                out.append("  (не указано)")
            else:
                out.append(f"  {val}")
        return out if len(out) > 1 else []

    chunks: list[str] = []
    st = tz.get("status")
    if st == "draft":
        chunks.append("[Черновик ТЗ — перед передачей исполнителю рекомендуется подтвердить в интерфейсе]")
        chunks.append("")
    hdr = sec.get("title") or ""
    if hdr:
        chunks.append(f"# {hdr}")
        chunks.append("")

    for label, key, lst in (
        ("Краткое описание", "short_description", False),
        ("Цель", "goal", False),
        ("Что нужно сделать", "tasks", True),
        ("Ожидаемый результат", "expected_result", False),
        ("Входные данные / материалы", "inputs", True),
        ("Ограничения", "constraints", True),
        ("Сроки", "deadline", False),
        ("Критерии готовности", "acceptance_criteria", True),
        ("Уточнения и риски", "clarifications_and_risks", True),
        ("Не определено / недостает данных", "missing_or_unclear", True),
    ):
        part = lines_for(label, key, as_list=lst)
        if part:
            chunks.extend(part)
            chunks.append("")

    text = "\n".join(chunks).strip()
    return text if text else None


class TZGenerationFailed(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


async def _ensure_org_member(session: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    m = await organization_repository.get_member(session, org_id, user_id)
    if m is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )


def _to_response(stored: dict) -> RequestTZResponse:
    parsed = RequestTZStored.model_validate(stored)
    return RequestTZResponse(
        status=parsed.status,
        generated_at=parsed.generated_at,
        confirmed_at=parsed.confirmed_at,
        sections=parsed.sections,
    )


async def generate_tz(
    session: AsyncSession,
    request_id: int,
    current_user: User,
) -> RequestTZResponse:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request has no organization",
        )

    await _ensure_org_member(session, req.organization_id, current_user.id)

    messages = build_tz_messages(req)
    try:
        raw = await post_chat_completion(messages, max_tokens=3072, temperature=0.25)
    except Exception as exc:
        logger.exception("TZ GigaChat call failed for request %s", request_id)
        raise TZGenerationFailed(str(exc)) from exc

    sections = parse_tz_llm_json(raw, req.ai_analysis if isinstance(req.ai_analysis, dict) else None)

    now = datetime.now(timezone.utc).isoformat()
    envelope: dict = {
        "status": "draft",
        "generated_at": now,
        "confirmed_at": None,
        "sections": sections.model_dump(),
    }

    req.ai_tz = envelope
    await request_repository.update(session, req)
    await session.commit()

    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None and refreshed.ai_tz is not None
    return _to_response(refreshed.ai_tz)


async def patch_tz(
    session: AsyncSession,
    request_id: int,
    current_user: User,
    payload: PatchRequestTZPayload,
) -> RequestTZResponse:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request has no organization",
        )

    await _ensure_org_member(session, req.organization_id, current_user.id)

    if not req.ai_tz or not isinstance(req.ai_tz, dict):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Technical specification has not been generated yet",
        )

    stored = RequestTZStored.model_validate(req.ai_tz)
    sec_dict = stored.sections.model_dump()

    if payload.sections:
        for key, val in payload.sections.items():
            if key not in RequestTZSections.model_fields:
                continue
            if key == "deadline":
                sec_dict[key] = val if val is None or isinstance(val, str) else str(val)
            elif key in (
                "tasks",
                "inputs",
                "constraints",
                "acceptance_criteria",
                "clarifications_and_risks",
                "missing_or_unclear",
            ):
                if isinstance(val, list):
                    sec_dict[key] = val
                elif val is None:
                    sec_dict[key] = []
                else:
                    sec_dict[key] = [str(val)]
            else:
                sec_dict[key] = "" if val is None else str(val)

    stored.sections = RequestTZSections(**sec_dict)

    if payload.status is not None:
        stored.status = payload.status
        if payload.status == "confirmed":
            stored.confirmed_at = datetime.now(timezone.utc).isoformat()
        elif payload.status == "draft":
            stored.confirmed_at = None

    req.ai_tz = stored.model_dump()
    await request_repository.update(session, req)
    await session.commit()

    refreshed = await request_repository.get_by_id(session, request_id)
    assert refreshed is not None and refreshed.ai_tz is not None
    return _to_response(refreshed.ai_tz)
