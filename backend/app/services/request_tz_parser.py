"""Parse and normalize LLM JSON into RequestTZSections."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.schemas.request_tz import RequestTZSections
from app.services.gigachat_client import strip_json_fence

logger = logging.getLogger(__name__)

_SECTION_KEYS = frozenset(RequestTZSections.model_fields.keys())


def _coerce_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    return str(v).strip()


def _coerce_str_list(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        return [_coerce_str(x) for x in v if _coerce_str(x)]
    if isinstance(v, str) and v.strip():
        return [v.strip()]
    return []


def _coerce_deadline(v: Any) -> str | None:
    if v is None:
        return None
    s = _coerce_str(v)
    return s if s else None


def _dedupe_items(items: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        cleaned = " ".join(item.split()).strip()
        if not cleaned:
            continue
        norm_key = cleaned.casefold()
        if norm_key in seen:
            continue
        seen.add(norm_key)
        out.append(cleaned)
    return out


def _with_terminal_dot(text: str) -> str:
    if not text:
        return text
    if text[-1] in ".!?":
        return text
    return f"{text}."


def _normalize_sections(sections: RequestTZSections) -> RequestTZSections:
    title = " ".join(sections.title.split())
    short_description = " ".join(sections.short_description.split())
    goal = " ".join(sections.goal.split())
    expected_result = " ".join(sections.expected_result.split())

    tasks = _dedupe_items(sections.tasks)
    inputs = _dedupe_items(sections.inputs)
    constraints = _dedupe_items(sections.constraints)
    acceptance_criteria = _dedupe_items(sections.acceptance_criteria)
    clarifications_and_risks = _dedupe_items(sections.clarifications_and_risks)
    missing_or_unclear = _dedupe_items(sections.missing_or_unclear)

    return sections.model_copy(
        update={
            "title": title,
            "short_description": _with_terminal_dot(short_description),
            "goal": _with_terminal_dot(goal),
            "expected_result": _with_terminal_dot(expected_result),
            "tasks": tasks,
            "inputs": inputs,
            "constraints": constraints,
            "acceptance_criteria": acceptance_criteria,
            "clarifications_and_risks": clarifications_and_risks,
            "missing_or_unclear": missing_or_unclear,
        }
    )


def _ensure_required_gaps(sections: RequestTZSections) -> RequestTZSections:
    gaps = list(sections.missing_or_unclear)

    if not sections.goal:
        gaps.append("Не определена цель задачи.")
    if not sections.tasks:
        gaps.append("Не сформулирован список работ.")
    if not sections.inputs:
        gaps.append("Не определены исходные данные и материалы.")
    if not sections.expected_result:
        gaps.append("Не описаны требования к результату.")
    if not sections.acceptance_criteria:
        gaps.append("Не заданы критерии приёмки.")
    if sections.deadline is None:
        gaps.append("Срок выполнения не определён в заявке.")

    return sections.model_copy(update={"missing_or_unclear": _dedupe_items(gaps)})


def _merge_analysis_gaps(ai: dict[str, Any] | None, sections: RequestTZSections) -> RequestTZSections:
    """Ensure missing_or_unclear reflects analysis issues when model left gaps."""
    extra: list[str] = []
    if ai and isinstance(ai, dict):
        if ai.get("status") == "not_ready":
            extra.append("Анализ: заявка не готова к обработке без уточнений.")
        if ai.get("status") == "needs_clarification":
            extra.append("Анализ: требуются уточнения по заявке.")
        for iss in ai.get("issues") or []:
            if isinstance(iss, dict) and iss.get("message"):
                extra.append(f"Анализ: {iss.get('message')}")
    merged_missing = _dedupe_items([*sections.missing_or_unclear, *extra])
    return sections.model_copy(update={"missing_or_unclear": merged_missing})


def parse_tz_llm_json(raw: str, ai_analysis: dict | None) -> RequestTZSections:
    cleaned = strip_json_fence(raw)
    try:
        data = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        logger.warning("TZ parse: invalid JSON, using minimal sections: %s", cleaned[:400])
        return _merge_analysis_gaps(
            ai_analysis,
            RequestTZSections(
                title="Не удалось разобрать ответ модели",
                short_description=cleaned[:500] if cleaned else "Пустой ответ",
                missing_or_unclear=["Ответ модели не является корректным JSON — повторите генерацию."],
            ),
        )

    if not isinstance(data, dict):
        return _merge_analysis_gaps(
            ai_analysis,
            RequestTZSections(title=str(data)[:200], missing_or_unclear=["Неверный формат ответа"]),
        )

    inner = data.get("sections") if isinstance(data.get("sections"), dict) else data

    kwargs: dict[str, Any] = {}
    for key in _SECTION_KEYS:
        if key not in inner:
            continue
        val = inner[key]
        if key == "deadline":
            kwargs[key] = _coerce_deadline(val)
        elif key in (
            "tasks",
            "inputs",
            "constraints",
            "acceptance_criteria",
            "clarifications_and_risks",
            "missing_or_unclear",
        ):
            kwargs[key] = _coerce_str_list(val)
        else:
            kwargs[key] = _coerce_str(val)

    sections = RequestTZSections(**kwargs)
    normalized = _normalize_sections(sections)
    with_analysis = _merge_analysis_gaps(ai_analysis, normalized)
    return _ensure_required_gaps(with_analysis)
