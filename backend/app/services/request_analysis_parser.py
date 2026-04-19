"""Parse, validate, and merge LLM output with deterministic issues into the canonical analysis shape."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.services.gigachat_client import strip_json_fence

logger = logging.getLogger(__name__)

_ISSUE_TYPES = frozenset(
    {
        "missing_info",
        "ambiguity",
        "contradiction",
        "weak_goal",
        "missing_context",
        "missing_constraints",
        "missing_deadline",
        "missing_artifacts",
    }
)
_SEVERITIES = frozenset({"low", "medium", "high"})
_STATUSES = frozenset({"ready", "needs_clarification", "not_ready"})

_SEVERITY_WEIGHT = {"high": 20, "medium": 11, "low": 4}

_OLD_ISSUE_MAP = {
    "incomplete_answer": "missing_info",
    "needs_clarification": "missing_context",
}


def extract_first_json_object(text: str) -> str | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    candidate = text[start : end + 1]
    try:
        json.loads(candidate)
    except (json.JSONDecodeError, ValueError):
        return None
    return candidate


def _coerce_field(raw: Any) -> str:
    if raw is None:
        return "general"
    if isinstance(raw, str):
        return raw.strip() or "general"
    return str(raw)


def _coerce_issue(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    itype = raw.get("type")
    if not isinstance(itype, str):
        itype = "missing_context"
    itype = _OLD_ISSUE_MAP.get(itype, itype)
    if itype not in _ISSUE_TYPES:
        itype = "missing_context"

    sev = raw.get("severity")
    if not isinstance(sev, str) or sev not in _SEVERITIES:
        sev = "medium"

    field = _coerce_field(raw.get("field"))
    msg = raw.get("message")
    if not isinstance(msg, str) or not msg.strip():
        return None
    return {"type": itype, "severity": sev, "field": field, "message": msg.strip()}


def _coerce_strength(raw: Any) -> str | None:
    if isinstance(raw, str) and raw.strip():
        return raw.strip()[:500]
    return None


def parse_llm_json(content: str) -> dict[str, Any]:
    """Parse LLM response; expects issues, strengths, recommendation."""
    cleaned = strip_json_fence(content)
    parsed: dict | None = None
    try:
        loaded = json.loads(cleaned)
        parsed = loaded if isinstance(loaded, dict) else None
    except (json.JSONDecodeError, ValueError):
        extracted = extract_first_json_object(cleaned)
        if extracted:
            try:
                loaded = json.loads(extracted)
                parsed = loaded if isinstance(loaded, dict) else None
            except (json.JSONDecodeError, ValueError):
                parsed = None

    if parsed is None:
        logger.warning("Request analysis: LLM returned invalid JSON. Snippet: %s", cleaned[:350])
        return {
            "issues": [],
            "strengths": [],
            "recommendation": "Не удалось разобрать ответ модели. Запустите анализ ещё раз.",
        }

    issues_raw = parsed.get("issues")
    issues: list[dict[str, Any]] = []
    if isinstance(issues_raw, list):
        for item in issues_raw:
            coerced = _coerce_issue(item)
            if coerced:
                issues.append(coerced)

    strengths_raw = parsed.get("strengths")
    strengths: list[str] = []
    if isinstance(strengths_raw, list):
        for item in strengths_raw:
            s = _coerce_strength(item)
            if s:
                strengths.append(s)
    strengths = strengths[:5]

    rec = parsed.get("recommendation")
    recommendation = rec.strip() if isinstance(rec, str) and rec.strip() else ""

    return {"issues": issues, "strengths": strengths, "recommendation": recommendation}


def _dedupe_key(issue: dict[str, Any]) -> tuple[str, str]:
    return (issue["type"], issue["field"])


def merge_rule_and_llm_issues(
    rule_issues: list[dict[str, Any]],
    llm_issues: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for issue in rule_issues:
        k = _dedupe_key(issue)
        if k in seen:
            continue
        seen.add(k)
        merged.append(issue)

    for issue in llm_issues:
        k = _dedupe_key(issue)
        if k in seen:
            continue
        seen.add(k)
        merged.append(issue)

    return merged


def _score_from_issues(issues: list[dict[str, Any]]) -> int:
    total = sum(_SEVERITY_WEIGHT.get(i.get("severity", "medium"), 11) for i in issues)
    return max(0, min(100, 100 - total))


def refine_status_ready(issues: list[dict[str, Any]], completeness_score: int) -> tuple[str, bool]:
    """
    status:
      - not_ready — есть блокирующие проблемы или очень низкая оценка
      - needs_clarification — есть замечания, но заявку можно готовить к работе после уточнений
      - ready — замечаний нет и оценка достаточна
    ready_for_processing — True только при status == ready (строгая трактовка «можно брать в работу как есть»).
    """
    has_high = any(i.get("severity") == "high" for i in issues)

    if has_high or completeness_score < 50:
        return "not_ready", False
    if not issues and completeness_score >= 80:
        return "ready", True
    if issues and completeness_score >= 50:
        return "needs_clarification", False
    return "not_ready", False


def build_final_payload(
    rule_issues: list[dict[str, Any]],
    llm_part: dict[str, Any],
) -> dict[str, Any]:
    llm_issues = llm_part.get("issues") or []
    if not isinstance(llm_issues, list):
        llm_issues = []

    merged = merge_rule_and_llm_issues(rule_issues, llm_issues)
    completeness_score = _score_from_issues(merged)

    strengths = llm_part.get("strengths") or []
    if not isinstance(strengths, list):
        strengths = []
    strengths = [s for s in strengths if isinstance(s, str) and s.strip()][:5]

    recommendation = llm_part.get("recommendation") if isinstance(llm_part.get("recommendation"), str) else ""
    recommendation = recommendation.strip()
    if not recommendation:
        if merged:
            top = merged[:2]
            recommendation = "Устраните замечания: " + "; ".join(i["message"] for i in top if i.get("message"))
        else:
            recommendation = "Заявку можно передавать в работу: критичных проблем не выявлено."

    status, ready_for_processing = refine_status_ready(merged, completeness_score)

    return {
        "status": status,
        "completeness_score": completeness_score,
        "ready_for_processing": ready_for_processing,
        "issues": merged,
        "strengths": strengths,
        "recommendation": recommendation[:2000],
    }


def normalize_legacy_stored_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize stored ai_analysis: coerce v1 (score, is_complete) and patch partial v2 rows."""
    if "completeness_score" in data:
        issues = data.get("issues") or []
        out_issues: list[dict[str, Any]] = []
        if isinstance(issues, list):
            for item in issues:
                if not isinstance(item, dict):
                    continue
                msg = item.get("message")
                if not isinstance(msg, str) or not msg.strip():
                    continue
                itype = item.get("type")
                if not isinstance(itype, str):
                    itype = "missing_context"
                itype = _OLD_ISSUE_MAP.get(itype, itype)
                if itype not in _ISSUE_TYPES:
                    itype = "missing_context"
                field = item.get("field")
                field_s = _coerce_field(field)
                sev = item.get("severity")
                if not isinstance(sev, str) or sev not in _SEVERITIES:
                    sev = "medium"
                out_issues.append(
                    {"type": itype, "severity": sev, "field": field_s, "message": msg.strip()}
                )
        strengths = data.get("strengths") if isinstance(data.get("strengths"), list) else []
        strengths = [s for s in strengths if isinstance(s, str) and s.strip()]
        rec = data.get("recommendation")
        rec_s = rec.strip() if isinstance(rec, str) else ""
        try:
            score = int(data.get("completeness_score", 0))
        except (TypeError, ValueError):
            score = 0
        score = max(0, min(100, score))
        status = data.get("status") if data.get("status") in _STATUSES else None
        ready = data.get("ready_for_processing")
        if status is None:
            status, _ = refine_status_ready(out_issues, score)
        if not isinstance(ready, bool):
            ready = status == "ready"
        return {
            "status": status,
            "completeness_score": score,
            "ready_for_processing": bool(ready),
            "issues": out_issues,
            "strengths": strengths[:5],
            "recommendation": rec_s or "См. список замечаний.",
        }

    issues_old = data.get("issues") or []
    new_issues: list[dict[str, Any]] = []
    if isinstance(issues_old, list):
        for item in issues_old:
            if not isinstance(item, dict):
                continue
            msg = item.get("message")
            if not isinstance(msg, str) or not msg.strip():
                continue
            itype = item.get("type")
            if not isinstance(itype, str):
                itype = "missing_context"
            itype = _OLD_ISSUE_MAP.get(itype, itype)
            if itype not in _ISSUE_TYPES:
                itype = "missing_context"
            field = _coerce_field(item.get("field"))
            new_issues.append(
                {
                    "type": itype,
                    "severity": "medium",
                    "field": field,
                    "message": msg.strip(),
                }
            )

    try:
        score = int(data.get("score", 0))
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(100, score))
    is_complete = bool(data.get("is_complete"))
    rec = data.get("recommendation")
    rec_s = rec.strip() if isinstance(rec, str) else ""

    status, ready = refine_status_ready(new_issues, score)
    if is_complete and not new_issues and score >= 80:
        status, ready = "ready", True
    elif is_complete and new_issues:
        status, ready = "needs_clarification", False

    return {
        "status": status,
        "completeness_score": score,
        "ready_for_processing": ready,
        "issues": new_issues,
        "strengths": [],
        "recommendation": rec_s or ("Дополните заявку по списку замечаний." if new_issues else "Заявка выглядит достаточно полной."),
    }
