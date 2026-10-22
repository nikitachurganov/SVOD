"""Free text or a chat dialog → request draft: form choice, title, summary, priority, field values.

Used by the Telegram bot for /new and for requests detected in group chats. Only fields that
can be safely expressed as text are filled; the LLM output is validated against the form schema.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_workflow as W
from app.models.form import Form
from app.repositories import form_repository
from app.services import public_form_suggest_service
from app.services.openrouter_client import post_chat_completion, strip_json_fence
from app.services.request_analysis_parser import extract_first_json_object

logger = logging.getLogger(__name__)

TEXT_TYPES = frozenset({"shortText", "longText", "fullName", "phone", "email"})
CHOICE_TYPES = frozenset({"dropdown", "radio", "checkbox"})
FILLABLE_TYPES = TEXT_TYPES | CHOICE_TYPES | frozenset({"number", "date", "dateTime", "yesNo"})

# Pseudo-field of the form snapshot that carries files taken from Telegram
ATTACHMENTS_FIELD_ID = "telegram_attachments"

_MAX_TITLE = 200
_MAX_SOURCE_CHARS = 12_000


class DraftError(Exception):
    """The organization has nothing to build a request with (no active forms)."""


@dataclass
class RequestDraft:
    form: Form
    title: str
    summary: str
    priority: str
    data: dict[str, Any]
    form_snapshot: dict[str, Any]
    missing_required: list[str]
    form_choices: list[dict[str, str]] = field(default_factory=list)


# ─── Form schema helpers ─────────────────────────────────────────────────────


def _options(raw: Any) -> list[dict[str, str]]:
    """Options are {id, label} objects; legacy forms store plain label strings."""
    out: list[dict[str, str]] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if isinstance(item, dict) and item.get("label") is not None:
            label = str(item["label"])
            out.append({"id": str(item.get("id") or label), "label": label})
        elif isinstance(item, str):
            out.append({"id": item, "label": item})
    return out


def leaf_fields(form: Form) -> list[dict[str, Any]]:
    """Leaf fields of all pages; groups are flattened like the web snapshot does."""
    result: list[dict[str, Any]] = []

    def walk(fields: Any) -> None:
        if not isinstance(fields, list):
            return
        for item in fields:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            if item.get("type") == "group" and item.get("children"):
                walk(item["children"])
            else:
                result.append(item)

    for page in form.fields if isinstance(form.fields, list) else []:
        if isinstance(page, dict):
            walk(page.get("fields"))
    return result


def build_form_snapshot(form: Form) -> dict[str, Any]:
    """Same shape as buildFormSnapshot on the frontend (src/shared/formily/formSubmit.utils.ts)."""
    return {
        "id": str(form.id),
        "title": form.name,
        "fields": [
            {
                "id": str(item["id"]),
                "label": item.get("label") or str(item["id"]),
                "type": item.get("type"),
                "required": bool(item.get("required")),
                "options": _options(item.get("options")) or None,
                "config": item.get("config"),
            }
            for item in leaf_fields(form)
        ],
    }


def _match_option(options: list[dict[str, str]], value: Any) -> dict[str, str] | None:
    needle = str(value).strip().casefold()
    if not needle:
        return None
    for option in options:
        if needle in (option["id"].casefold(), option["label"].strip().casefold()):
            return option
    return None


def normalize_value(field_def: dict[str, Any], value: Any) -> Any | None:
    """Coerce an LLM value to the storage format of the web form; None when it doesn't fit."""
    if value is None:
        return None
    kind = field_def.get("type")
    if kind in TEXT_TYPES:
        text = str(value).strip() if isinstance(value, (str, int, float)) else ""
        return text or None
    if kind == "number":
        if isinstance(value, bool):
            return None
        try:
            number = float(str(value).replace(",", ".").replace(" ", ""))
        except ValueError:
            return None
        return int(number) if number.is_integer() else number
    if kind == "date":
        try:
            return date.fromisoformat(str(value).strip()[:10]).isoformat()
        except ValueError:
            return None
    if kind == "dateTime":
        raw = str(value).strip().replace("T", " ")[:16]
        try:
            return datetime.strptime(raw, "%Y-%m-%d %H:%M").strftime("%Y-%m-%d %H:%M")
        except ValueError:
            return None
    if kind == "yesNo":
        answer = str(value).strip().casefold()
        if answer in ("yes", "да", "true"):
            return "yes"
        if answer in ("no", "нет", "false"):
            return "no"
        return None
    options = _options(field_def.get("options"))
    if kind == "dropdown":
        option = _match_option(options, value)
        return option["id"] if option else None
    if kind == "radio":
        option = _match_option(options, value)
        return option["label"] if option else None
    if kind == "checkbox":
        values = value if isinstance(value, list) else [value]
        labels = [option["label"] for option in (_match_option(options, v) for v in values) if option]
        return list(dict.fromkeys(labels)) or None
    return None


def _describe_field(field_def: dict[str, Any]) -> dict[str, Any]:
    described: dict[str, Any] = {
        "id": str(field_def["id"]),
        "label": field_def.get("label") or str(field_def["id"]),
        "type": field_def.get("type"),
        "required": bool(field_def.get("required")),
    }
    if field_def.get("description"):
        described["hint"] = str(field_def["description"])[:200]
    options = _options(field_def.get("options"))
    if options:
        described["options"] = [option["label"] for option in options]
    return described


# ─── LLM ─────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "Ты помощник сервиса приёма заявок СВОД. По описанию задачи или по переписке команды "
    "составь заявку: короткий заголовок, саммари, приоритет и значения полей формы. "
    "Заполняй поле, только если в тексте есть явные данные для него, ничего не выдумывай. "
    "Пиши по-русски. Отвечай только JSON без markdown и пояснений."
)


def _build_messages(form: Form, fields: list[dict[str, Any]], source_text: str) -> list[dict[str, str]]:
    catalog = [_describe_field(item) for item in fields]
    user_prompt = (
        f"Сегодня {date.today().isoformat()}.\n\n"
        f"Исходный текст:\n{source_text[:_MAX_SOURCE_CHARS]}\n\n"
        f"Форма «{form.name}». Поля (JSON):\n{json.dumps(catalog, ensure_ascii=False)}\n\n"
        "Верни JSON вида "
        '{"title": "суть задачи, до 120 символов", '
        '"summary": "2–5 предложений: что нужно сделать, сроки, ограничения", '
        '"priority": "low|medium|high|urgent", '
        '"fields": {"<id поля>": значение}}.\n'
        "Форматы значений: текстовые поля — строка; number — число; date — YYYY-MM-DD; "
        "dateTime — YYYY-MM-DD HH:mm; dropdown и radio — одна строка из options; "
        'checkbox — массив строк из options; yesNo — "yes" или "no". '
        "Поля без данных не включай в fields."
    )
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]


def _parse_json(raw: str) -> dict[str, Any] | None:
    chunk = extract_first_json_object(strip_json_fence(raw.strip()))
    if not chunk:
        return None
    try:
        parsed = json.loads(chunk)
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _fallback_title(source_text: str) -> str:
    first_line = next((line.strip() for line in source_text.splitlines() if line.strip()), "")
    title = first_line or "Заявка из Telegram"
    return title if len(title) <= _MAX_TITLE else title[: _MAX_TITLE - 1].rstrip() + "…"


async def fill_form(form: Form, source_text: str) -> RequestDraft:
    """Ask the LLM to fill the form; degrade to a plain text draft when it fails."""
    fields = leaf_fields(form)
    fillable = [item for item in fields if item.get("type") in FILLABLE_TYPES]
    payload: dict[str, Any] | None = None
    try:
        raw = await post_chat_completion(
            _build_messages(form, fillable, source_text), max_tokens=1500, temperature=0.1
        )
        payload = _parse_json(raw)
        if payload is None:
            logger.warning("Request draft: unparseable LLM answer: %s", raw[:400])
    except Exception:
        logger.exception("Request draft: LLM call failed for form %s", form.id)
    payload = payload or {}

    title = str(payload.get("title") or "").strip()[:_MAX_TITLE] or _fallback_title(source_text)
    summary = str(payload.get("summary") or "").strip() or source_text.strip()[:2000]
    priority = str(payload.get("priority") or "").strip().lower()
    if priority not in W.PRIORITIES:
        priority = W.PRIORITY_MEDIUM

    raw_values = payload.get("fields")
    raw_values = raw_values if isinstance(raw_values, dict) else {}
    by_id = {str(item["id"]): item for item in fillable}
    data: dict[str, Any] = {}
    for field_id, value in raw_values.items():
        field_def = by_id.get(str(field_id))
        if field_def is None:
            continue
        normalized = normalize_value(field_def, value)
        if normalized is not None:
            data[str(field_id)] = normalized

    # The task description must land somewhere visible: the first empty text field
    if not any(by_id[key].get("type") in TEXT_TYPES for key in data):
        target = next(
            (item for item in fillable if item.get("type") == "longText" and str(item["id"]) not in data),
            None,
        ) or next(
            (item for item in fillable if item.get("type") == "shortText" and str(item["id"]) not in data),
            None,
        )
        if target is not None:
            data[str(target["id"])] = summary

    missing = [
        item.get("label") or str(item["id"])
        for item in fields
        if item.get("required") and str(item["id"]) not in data
    ]
    return RequestDraft(
        form=form,
        title=title,
        summary=summary,
        priority=priority,
        data=data,
        form_snapshot=build_form_snapshot(form),
        missing_required=missing,
    )


# ─── Form choice ─────────────────────────────────────────────────────────────


async def _pick_forms(
    session: AsyncSession, organization_id: uuid.UUID, source_text: str
) -> tuple[Form, list[Form]]:
    """Best form plus the other active forms of the org, best matches first."""
    active = await form_repository.get_active_by_org(session, organization_id)
    if not active:
        raise DraftError("В организации нет активных форм заявок")
    by_id = {str(form.id): form for form in active}

    suggestion = await public_form_suggest_service.suggest_forms_for_org(
        session, organization_id, source_text
    )
    ranked = [by_id[card.id] for card in suggestion.forms if card.id in by_id]
    universal = next((form for form in active if form.is_universal), None)
    if not ranked and universal is not None:
        ranked = [universal]
    rest = sorted(
        (form for form in active if form not in ranked),
        key=lambda form: (not form.is_universal, -(form.usage_count or 0), form.name),
    )
    ordered = ranked + rest
    return ordered[0], ordered


def form_choices(forms: list[Form], limit: int = 8) -> list[dict[str, str]]:
    return [{"id": str(form.id), "name": form.name} for form in forms[:limit]]


async def draft_from_text(
    session: AsyncSession, organization_id: uuid.UUID, source_text: str
) -> RequestDraft:
    form, ordered = await _pick_forms(session, organization_id, source_text)
    draft = await fill_form(form, source_text)
    draft.form_choices = form_choices(ordered)
    return draft


async def redraft_with_form(
    session: AsyncSession, organization_id: uuid.UUID, form_id: uuid.UUID, source_text: str
) -> RequestDraft:
    form = await form_repository.get_by_id(session, form_id)
    if form is None or form.organization_id != organization_id or form.archived:
        raise DraftError("Форма недоступна")
    return await fill_form(form, source_text)
