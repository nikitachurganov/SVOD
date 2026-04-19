"""Orchestration: load request, run rules + LLM, validate, persist ai_analysis."""

from __future__ import annotations

import logging

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import request_repository
from app.services.gigachat_client import post_chat_completion
from app.services.request_analysis_parser import build_final_payload, parse_llm_json
from app.services.request_analysis_prompt_builder import build_messages
from app.services.request_analysis_rules import run_deterministic_checks

logger = logging.getLogger(__name__)


class AnalysisGenerationFailed(Exception):
    """Raised when the analysis cannot be completed (e.g. LLM transport error)."""

    def __init__(self, message: str = "Не удалось выполнить анализ заявки"):
        self.message = message
        super().__init__(message)


async def generate_analysis(session: AsyncSession, request_id: int) -> dict:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise ValueError(f"Request {request_id} not found")

    rule_issues = run_deterministic_checks(req)
    messages = build_messages(req, rule_issues)

    logger.info(
        "Request %s: starting quality analysis (%s rule issue(s))",
        request_id,
        len(rule_issues),
    )

    try:
        raw = await post_chat_completion(messages, max_tokens=1200, temperature=0.12)
    except httpx.HTTPError as exc:
        logger.exception("GigaChat HTTP error during analysis for request %s", request_id)
        raise AnalysisGenerationFailed(
            "Сервис ИИ временно недоступен или вернул ошибку. Попробуйте позже."
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected error calling GigaChat for request %s", request_id)
        raise AnalysisGenerationFailed("Не удалось получить ответ от сервиса ИИ.") from exc

    llm_part = parse_llm_json(raw)
    final = build_final_payload(rule_issues, llm_part)

    req.ai_analysis = final
    await request_repository.update(session, req)
    await session.commit()

    logger.info(
        "Request %s: analysis stored (status=%s, score=%s, issues=%s)",
        request_id,
        final.get("status"),
        final.get("completeness_score"),
        len(final.get("issues") or []),
    )
    return final


async def get_analysis(session: AsyncSession, request_id: int) -> dict | None:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise ValueError(f"Request {request_id} not found")
    return req.ai_analysis
