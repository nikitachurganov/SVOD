"""Validation, quality flags and CSV export of survey answers (pure functions)."""

from __future__ import annotations

import copy
import csv
import io
import json
from typing import Any

from app.services.survey_methodology_service import iter_leaf_fields

MAX_ANSWERS_BYTES = 200_000
MAX_TEXT_LENGTH = 10_000
_FILE_TYPES = {"file_vector", "file_image", "file_document"}
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def answerable_fields(pages: Any) -> list[dict[str, Any]]:
    return [
        f
        for f in iter_leaf_fields(pages)
        if isinstance(f.get("id"), str) and f.get("type") not in _FILE_TYPES
    ]


def _option_pairs(field: dict[str, Any]) -> list[tuple[str, str]]:
    return [
        (o["id"], str(o.get("label", "")))
        for o in field.get("options") or []
        if isinstance(o, dict) and isinstance(o.get("id"), str)
    ]


def question_defs(pages: Any) -> list[dict[str, Any]]:
    """Questions in form order with their options — for showing a response as the respondent saw it."""
    defs: list[dict[str, Any]] = []
    for field in answerable_fields(pages):
        config = field.get("config")
        methodology = config.get("methodology") if isinstance(config, dict) else None
        defs.append(
            {
                "id": field["id"],
                "type": str(field.get("type") or ""),
                "label": str(field.get("label") or field["id"]),
                "options": [{"id": oid, "label": label} for oid, label in _option_pairs(field)],
                "methodology": methodology if isinstance(methodology, str) else None,
            }
        )
    return defs


def structure_conflicts(old_pages: Any, new_pages: Any) -> list[str]:
    """Edits that would change the meaning of answers already collected.

    A response stores answers by question id and option id, so once responses exist a question
    must not disappear, change its type, or lose / replace an option. Rewording, adding questions
    and adding options stay allowed (every response keeps its own form snapshot).
    """
    new_by_id = {f["id"]: f for f in answerable_fields(new_pages)}
    problems: list[str] = []
    for old in answerable_fields(old_pages):
        label = str(old.get("label") or old["id"])
        new = new_by_id.get(old["id"])
        if new is None:
            problems.append(f"Вопрос «{label}» удалён")
            continue
        if new.get("type") != old.get("type"):
            problems.append(f"У вопроса «{label}» изменён тип")
            continue
        kept = {oid for oid, _ in _option_pairs(new)}
        removed = [text for oid, text in _option_pairs(old) if oid not in kept]
        if removed:
            problems.append(f"У вопроса «{label}» удалены варианты: {', '.join(removed)}")
    return problems


def strip_private_config(pages: Any) -> list[Any]:
    """Pages for respondents: without the correct answer of attention checks."""
    cleaned = copy.deepcopy(pages) if isinstance(pages, list) else []

    def walk(fields: Any) -> None:
        if not isinstance(fields, list):
            return
        for f in fields:
            if not isinstance(f, dict):
                continue
            config = f.get("config")
            if isinstance(config, dict):
                config.pop("attentionCorrect", None)
            walk(f.get("children"))

    for page in cleaned:
        if isinstance(page, dict):
            walk(page.get("fields"))
    return cleaned


def _clean_value(value: Any) -> Any:
    if isinstance(value, str):
        return value[:MAX_TEXT_LENGTH]
    if isinstance(value, list):
        return [_clean_value(v) for v in value[:100]]
    if isinstance(value, dict):
        return {str(k)[:100]: _clean_value(v) for k, v in list(value.items())[:50]}
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:MAX_TEXT_LENGTH]


class AnswersError(ValueError):
    def __init__(self, code: str, missing: list[str] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.missing = missing or []


def validate_answers(pages: Any, answers: dict[str, Any]) -> dict[str, Any]:
    """Drops unknown ids, checks required fields, returns the cleaned answers."""
    if len(json.dumps(answers, ensure_ascii=False, default=str)) > MAX_ANSWERS_BYTES:
        raise AnswersError("answers_too_large")
    fields = answerable_fields(pages)
    cleaned: dict[str, Any] = {}
    missing: list[str] = []
    for field in fields:
        fid = field["id"]
        value = answers.get(fid)
        if is_empty(value):
            if field.get("required"):
                missing.append(str(field.get("label") or fid))
            continue
        cleaned[fid] = _clean_value(value)
    if missing:
        raise AnswersError("required_missing", missing)
    return cleaned


def _option_matches(field: dict[str, Any], value: Any, correct_label: str) -> bool:
    candidates = {correct_label.strip().lower()}
    for opt in field.get("options") or []:
        if isinstance(opt, dict) and str(opt.get("label", "")).strip().lower() == correct_label.strip().lower():
            if isinstance(opt.get("id"), str):
                candidates.add(opt["id"].lower())
    values = value if isinstance(value, list) else [value]
    return any(str(v).strip().lower() in candidates for v in values)


def quality_flags(
    pages: Any, answers: dict[str, Any], duration_seconds: int | None
) -> dict[str, Any] | None:
    flags: dict[str, Any] = {}
    fields = answerable_fields(pages)
    for field in fields:
        config = field.get("config")
        if not (isinstance(config, dict) and config.get("attentionCheck")):
            continue
        correct = config.get("attentionCorrect")
        if not isinstance(correct, str):
            continue
        value = answers.get(field["id"])
        if is_empty(value) or not _option_matches(field, value, correct):
            flags["failed_attention_check"] = True
    if duration_seconds is not None and fields:
        # Less than ~1.5 s per question is faster than reading the questions
        if duration_seconds < max(5.0, len(fields) * 1.5):
            flags["too_fast"] = True
    return flags or None


# ─── CSV ──────────────────────────────────────────────────────────────────────


def _label_maps(fields: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    maps: dict[str, dict[str, str]] = {}
    for f in fields:
        options = f.get("options")
        if isinstance(options, list):
            maps[f["id"]] = {
                o["id"]: str(o.get("label", ""))
                for o in options
                if isinstance(o, dict) and isinstance(o.get("id"), str)
            }
    return maps


def _format_value(value: Any, labels: dict[str, str]) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "; ".join(_format_value(v, labels) for v in value)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return "да" if value else "нет"
    text = labels.get(str(value), str(value))
    return text


def _safe_cell(text: str) -> str:
    return "'" + text if text.startswith(_FORMULA_PREFIXES) else text


def build_csv(pages: Any, responses: list[Any]) -> str:
    fields = answerable_fields(pages)
    labels = _label_maps(fields)
    out = io.StringIO()
    writer = csv.writer(out, delimiter=";", lineterminator="\r\n")
    header = ["Дата и время (UTC)", "Длительность, с", "Флаги качества"] + [
        _safe_cell(str(f.get("label") or f["id"])) for f in fields
    ]
    writer.writerow(header)
    for resp in responses:
        flags = resp.quality_flags or {}
        flag_text = ", ".join(sorted(k for k, v in flags.items() if v))
        row = [
            resp.submitted_at.strftime("%Y-%m-%d %H:%M:%S"),
            "" if resp.duration_seconds is None else str(resp.duration_seconds),
            flag_text,
        ]
        answers = resp.answers if isinstance(resp.answers, dict) else {}
        for f in fields:
            row.append(_safe_cell(_format_value(answers.get(f["id"]), labels.get(f["id"], {}))))
        writer.writerow(row)
    return out.getvalue()
