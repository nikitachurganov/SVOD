"""Deterministic request quality checks (no LLM)."""

from __future__ import annotations

import re
from typing import Any

from app.models.request import Request

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

_DEADLINE_LABEL_RE = re.compile(
    r"(срок|дедлайн|deadline|к\s*какому\s*числу|когда\s*нужно|дата\s*выполнения|finish\s*date)",
    re.IGNORECASE,
)
_BUDGET_LABEL_RE = re.compile(r"(бюджет|budget|стоимость|цена|оценк[аи]\s*затрат)", re.IGNORECASE)
_GOAL_LABEL_RE = re.compile(
    r"(ожидаем(ый|ого)?\s*результат|результат|итог|цель|задач[аи]|scope|объ[её]м)",
    re.IGNORECASE,
)


def _is_empty_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, (list, dict)) and not value:
        return True
    return False


def _iter_snapshot_fields(form_snapshot: dict | list | None) -> list[dict[str, Any]]:
    if not form_snapshot:
        return []
    fields = form_snapshot if isinstance(form_snapshot, list) else form_snapshot.get("fields", [])
    if not isinstance(fields, list):
        return []
    out: list[dict[str, Any]] = []
    for f in fields:
        if isinstance(f, dict) and "id" in f:
            out.append(f)
    return out


def _make_issue(
    *,
    itype: str,
    severity: str,
    field: str,
    message: str,
) -> dict[str, Any]:
    if itype not in _ISSUE_TYPES:
        itype = "missing_info"
    if severity not in ("low", "medium", "high"):
        severity = "medium"
    return {
        "type": itype,
        "severity": severity,
        "field": field,
        "message": message.strip(),
    }


def run_deterministic_checks(req: Request) -> list[dict[str, Any]]:
    """
    Obvious gaps: required fields, deadline/budget/goal-shaped fields empty, very short title.
    Returns issues in the same shape as the final API (type, severity, field, message).
    """
    data = req.data if isinstance(req.data, dict) else {}
    issues: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str]] = set()

    def add_issue(issue: dict[str, Any]) -> None:
        key = (issue["type"], issue["field"])
        if key in seen_keys:
            return
        seen_keys.add(key)
        issues.append(issue)

    title = (req.title or "").strip()
    if len(title) < 4:
        add_issue(
            _make_issue(
                type="missing_context",
                severity="medium",
                field="title",
                message="Укажите понятный заголовок заявки: сейчас он слишком короткий или пустой.",
            )
        )

    for f in _iter_snapshot_fields(req.form_snapshot):
        fid = str(f["id"])
        label = str(f.get("label") or fid)
        ftype = str(f.get("type") or "shortText")
        required = bool(f.get("required", False))
        val = data.get(fid)

        if required and _is_empty_value(val):
            add_issue(
                _make_issue(
                    type="missing_info",
                    severity="high",
                    field=fid,
                    message=f'Поле «{label}» отмечено как обязательное, но не заполнено — добавьте значение.',
                )
            )

        label_id = f"{label} {fid}"
        if ftype in ("date", "dateTime") and _DEADLINE_LABEL_RE.search(label_id) and _is_empty_value(val):
            add_issue(
                _make_issue(
                    type="missing_deadline",
                    severity="high",
                    field=fid,
                    message=f'В поле «{label}» не указан срок или дата — укажите, когда нужен результат.',
                )
            )

        if ftype in ("shortText", "longText") and _BUDGET_LABEL_RE.search(label_id) and _is_empty_value(val):
            add_issue(
                _make_issue(
                    type="missing_constraints",
                    severity="medium",
                    field=fid,
                    message=f'В поле «{label}» не указаны ограничения по бюджету или стоимости — укажите сумму или диапазон.',
                )
            )

        if ftype in ("shortText", "longText") and _GOAL_LABEL_RE.search(label_id) and _is_empty_value(val):
            add_issue(
                _make_issue(
                    type="weak_goal",
                    severity="medium",
                    field=fid,
                    message=f'В поле «{label}» не описан ожидаемый результат — опишите, что должно быть сделано.',
                )
            )

    # Contact channel for follow-up (internal author without email is rare but possible)
    if req.source == "public_link":
        if not (req.applicant_email and str(req.applicant_email).strip()):
            add_issue(
                _make_issue(
                    type="missing_info",
                    severity="high",
                    field="general",
                    message="Не указан email заявителя — без него сложно запросить уточнения.",
                )
            )
    elif req.author is not None and not (req.author.email and str(req.author.email).strip()):
        add_issue(
            _make_issue(
                type="missing_context",
                severity="low",
                field="general",
                message="У автора заявки не указан email в профиле — для уточнений лучше иметь контакт.",
            )
        )

    return issues
