"""Shared helpers for building AI prompts from request + form snapshot."""

import json

from app.models.request import Request


def format_value(value: object) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def build_label_map(form_snapshot: dict | None) -> dict[str, str]:
    if not form_snapshot:
        return {}
    fields = form_snapshot if isinstance(form_snapshot, list) else form_snapshot.get("fields", [])
    return {
        f["id"]: f.get("label", f.get("name", f["id"]))
        for f in fields
        if isinstance(f, dict) and "id" in f
    }


def build_form_answers_text(req: Request) -> str:
    """Human-readable lines for each answered field (skips empty values)."""
    if not req.data or not isinstance(req.data, dict):
        return "(нет ответов по полям формы)"

    labels = build_label_map(req.form_snapshot)
    lines: list[str] = []
    for key, value in req.data.items():
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        if isinstance(value, (list, dict)) and not value:
            continue
        lines.append(f"- {labels.get(key, key)}: {format_value(value)}")

    return "\n".join(lines) if lines else "(пустые или незаполненные ответы)"


def build_applicant_block(req: Request) -> str | None:
    parts: list[str] = []
    if req.applicant_name:
        parts.append(f"Имя: {req.applicant_name}")
    if req.applicant_email:
        parts.append(f"Email: {req.applicant_email}")
    if req.applicant_phone:
        parts.append(f"Телефон: {req.applicant_phone}")
    if not parts:
        return None
    return "\n".join(parts)


def build_internal_author_name(req: Request) -> str | None:
    if not req.author:
        return None
    name = " ".join(
        filter(None, [req.author.last_name, req.author.first_name, req.author.middle_name])
    )
    return name or None


def build_author_context_line(req: Request) -> str | None:
    """Russian label for quality-analysis prompts."""
    name = build_internal_author_name(req)
    return f"Автор (внутренний пользователь): {name}" if name else None
