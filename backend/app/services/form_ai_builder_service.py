"""Build / edit a form schema from a chat conversation via LLM (OpenRouter)."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.schemas.form_ai import FormAiBuildRequest, FormAiBuildResponse
from app.services.openrouter_client import post_chat_completion, strip_json_fence
from app.services.request_analysis_parser import extract_first_json_object

logger = logging.getLogger(__name__)

# Field types available in the form builder (src/shared/types/form-builder.types.ts)
FIELD_TYPE_DESCRIPTIONS: dict[str, str] = {
    "shortText": "Короткий текст (одна строка)",
    "longText": "Длинный текст (многострочный комментарий, описание)",
    "dropdown": "Выпадающий список — выбор одного значения из options",
    "radio": "Один вариант — радиокнопки, выбор одного значения из options",
    "checkbox": "Несколько вариантов — чекбоксы, выбор нескольких значений из options",
    "yesNo": "Да / Нет — переключатель",
    "number": "Число",
    "rating": "Оценка по шкале (звёзды, числовая шкала, слайдер, NPS)",
    "fullName": "Полное имя (ФИО)",
    "phone": "Номер телефона",
    "email": "Электронная почта",
    "address_country_city": "Страна и город (два связанных списка)",
    "location": "Города и страны (поиск страны/города)",
    "address": "Адрес с подсказками",
    "date": "Дата",
    "dateTime": "Дата и время",
    "time": "Время",
    "file_vector": "Загрузка векторных файлов (svg, ai, eps, pdf)",
    "file_image": "Загрузка изображений",
    "file_document": "Загрузка документов",
    "group": "Группа полей — контейнер, объединяющий связанные поля в children",
}

_TYPES_WITH_OPTIONS = {"dropdown", "radio", "checkbox"}
_RATING_VARIANTS = {"stars", "numeric_scale", "slider", "nps"}
_LOCATION_MODES = {"country_only", "city_only", "country_and_city"}

_MAX_PAGES = 10
_MAX_FIELDS_PER_LEVEL = 60
_MAX_OPTIONS = 50
_MAX_LABEL = 300
_MAX_DESCRIPTION = 1000

_SYSTEM_PROMPT = f"""Ты — ИИ-конструктор форм заявок в сервисе «СВОД». Пользователь описывает, какая форма ему нужна, \
или просит изменить текущую форму. Ты собираешь форму ТОЛЬКО из доступных типов полей.

Доступные типы полей (значение type → назначение):
{chr(10).join(f"- {k}: {v}" for k, v in FIELD_TYPE_DESCRIPTIONS.items())}

Структура поля:
{{
  "id": "<id существующего поля, если оно сохраняется; для нового поля не указывай>",
  "type": "<один из типов выше>",
  "label": "<название поля на русском>",
  "description": "<подсказка/описание для заполняющего, можно пустую строку>",
  "required": true | false,
  "options": ["Вариант 1", "Вариант 2"],      // только для dropdown, radio, checkbox
  "config": {{ ... }},                         // только для rating и location, иначе не указывай
  "children": [ ...поля... ]                   // только для group; группы нельзя вкладывать в группы
}}
config для rating: {{"ratingVariant": "stars"|"numeric_scale"|"slider"|"nps", "min": 1, "max": 5, "step": 1, \
"leftLabel": "", "rightLabel": ""}}.
config для location: {{"mode": "country_only"|"city_only"|"country_and_city"}}.

Правила:
- Выбирай наиболее подходящий специализированный тип: для телефона — phone, для почты — email, для ФИО — fullName, \
для дат — date, для файлов — file_*, для выбора из списка — dropdown/radio/checkbox с осмысленными options.
- Названия полей, подсказки и варианты — на русском языке, коротко и понятно.
- Логически связанные поля (например, контактные данные) можно объединять в group.
- Длинные формы можно разбивать на несколько страниц (pages), обычно достаточно одной.
- Если пользователь просит изменить текущую форму — возьми текущую форму за основу, сохрани id неизменённых \
и изменённых полей и внеси только запрошенные изменения.
- Если сообщение пользователя не требует изменения формы (вопрос, уточнение) — верни "pages": null.

Отвечай ТОЛЬКО валидным JSON без markdown и пояснений вне JSON, строго в формате:
{{
  "reply": "<короткий ответ пользователю на русском: что сделано или уточняющий вопрос>",
  "title": "<название формы или null, если менять не нужно>",
  "pages": [ {{ "title": "Страница 1", "fields": [ ...поля... ] }} ] | null
}}
"""


# ─── Current form → compact LLM context ───────────────────────────────────────


def _compact_field(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    out: dict[str, Any] = {
        "id": raw.get("id"),
        "type": raw.get("type"),
        "label": raw.get("label") or "",
        "description": raw.get("placeholder") or raw.get("description") or "",
        "required": bool(raw.get("required")),
    }
    raw_config = raw.get("config")
    if isinstance(raw_config, dict) and isinstance(raw_config.get("methodology"), str):
        out["methodology"] = raw_config["methodology"]
    options = raw.get("options")
    if isinstance(options, list) and options:
        out["options"] = [
            o.get("label") if isinstance(o, dict) else str(o) for o in options if o is not None
        ]
    config = raw.get("config")
    if raw.get("type") in ("rating", "location") and isinstance(config, dict):
        out["config"] = config
    children = raw.get("children")
    if isinstance(children, list) and children:
        out["children"] = [c for c in (_compact_field(ch) for ch in children) if c]
    return out


def _compact_pages(pages: list[Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for index, page in enumerate(pages):
        if not isinstance(page, dict):
            continue
        fields = page.get("fields") if isinstance(page.get("fields"), list) else []
        result.append(
            {
                "title": page.get("title") or f"Страница {index + 1}",
                "fields": [f for f in (_compact_field(x) for x in fields) if f],
            }
        )
    return result


def _collect_ids(pages: list[Any]) -> set[str]:
    ids: set[str] = set()

    def walk(fields: Any) -> None:
        if not isinstance(fields, list):
            return
        for f in fields:
            if isinstance(f, dict):
                if isinstance(f.get("id"), str):
                    ids.add(f["id"])
                walk(f.get("children"))

    for page in pages:
        if isinstance(page, dict):
            walk(page.get("fields"))
    return ids


# ─── LLM output → sanitized form payload ──────────────────────────────────────


def _str(value: Any, limit: int) -> str:
    if value is None:
        return ""
    return str(value).strip()[:limit]


def _sanitize_config(field_type: str, raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    if field_type == "rating":
        cfg: dict[str, Any] = {}
        variant = raw.get("ratingVariant")
        if variant in _RATING_VARIANTS:
            cfg["ratingVariant"] = variant
        for key in ("min", "max", "step"):
            val = raw.get(key)
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                cfg[key] = val
        for key in ("leftLabel", "rightLabel"):
            if isinstance(raw.get(key), str) and raw[key].strip():
                cfg[key] = _str(raw[key], 100)
        return cfg or None
    if field_type == "location":
        mode = raw.get("mode")
        return {"mode": mode} if mode in _LOCATION_MODES else None
    return None


def _sanitize_field(
    raw: Any,
    *,
    known_ids: set[str],
    used_ids: set[str],
    allow_group: bool,
    methodologies: frozenset[str] = frozenset(),
) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    field_type = raw.get("type")
    if field_type not in FIELD_TYPE_DESCRIPTIONS:
        logger.info("AI form builder: dropping field with unknown type %r", field_type)
        return None
    if field_type == "group" and not allow_group:
        return None

    field: dict[str, Any] = {
        "type": field_type,
        "label": _str(raw.get("label"), _MAX_LABEL),
        "placeholder": _str(raw.get("description") or raw.get("placeholder"), _MAX_DESCRIPTION)
        or None,
        "required": bool(raw.get("required")),
    }

    # Keep ids only for fields that already exist, and only once
    raw_id = raw.get("id")
    if isinstance(raw_id, str) and raw_id in known_ids and raw_id not in used_ids:
        field["id"] = raw_id
        used_ids.add(raw_id)

    if field_type in _TYPES_WITH_OPTIONS:
        options: list[dict[str, Any]] = []
        raw_options = raw.get("options")
        if isinstance(raw_options, list):
            for opt in raw_options[:_MAX_OPTIONS]:
                label = _str(opt.get("label") if isinstance(opt, dict) else opt, _MAX_LABEL)
                if label:
                    options.append({"label": label})
        if not options:
            options = [{"label": "Вариант 1"}, {"label": "Вариант 2"}]
        field["options"] = options

    config = _sanitize_config(field_type, raw.get("config"))
    if config:
        field["config"] = config

    # Survey builder: keep a reference to the research methodology the question belongs to
    tag = raw.get("methodology")
    if isinstance(tag, str) and tag in methodologies:
        field.setdefault("config", {})["methodology"] = tag

    if field_type == "group":
        children_raw = raw.get("children") if isinstance(raw.get("children"), list) else []
        field["children"] = [
            c
            for c in (
                _sanitize_field(
                    ch,
                    known_ids=known_ids,
                    used_ids=used_ids,
                    allow_group=False,
                    methodologies=methodologies,
                )
                for ch in children_raw[:_MAX_FIELDS_PER_LEVEL]
            )
            if c
        ]

    return field


def _sanitize_pages(
    raw_pages: Any,
    known_ids: set[str],
    methodologies: frozenset[str] = frozenset(),
) -> list[dict[str, Any]] | None:
    if not isinstance(raw_pages, list):
        return None
    used_ids: set[str] = set()
    pages: list[dict[str, Any]] = []
    for index, raw_page in enumerate(raw_pages[:_MAX_PAGES]):
        if isinstance(raw_page, dict):
            title = _str(raw_page.get("title"), 200) or f"Страница {index + 1}"
            raw_fields = raw_page.get("fields")
        elif isinstance(raw_page, list):
            title, raw_fields = f"Страница {index + 1}", raw_page
        else:
            continue
        if not isinstance(raw_fields, list):
            raw_fields = []
        fields = [
            f
            for f in (
                _sanitize_field(
                    x,
                    known_ids=known_ids,
                    used_ids=used_ids,
                    allow_group=True,
                    methodologies=methodologies,
                )
                for x in raw_fields[:_MAX_FIELDS_PER_LEVEL]
            )
            if f
        ]
        pages.append({"title": title, "fields": fields})
    return pages or None


def _parse_payload(raw: str) -> dict[str, Any] | None:
    cleaned = strip_json_fence(raw)
    for candidate in (cleaned, extract_first_json_object(cleaned)):
        if not candidate:
            continue
        try:
            obj = json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(obj, dict):
            return obj
    return None


# ─── Public entrypoint ────────────────────────────────────────────────────────


async def build_form(payload: FormAiBuildRequest) -> FormAiBuildResponse:
    current_pages = _compact_pages(payload.pages)
    known_ids = _collect_ids(payload.pages)

    context = (
        "Текущая форма (JSON):\n"
        + json.dumps(
            {"title": payload.title.strip() or None, "pages": current_pages},
            ensure_ascii=False,
        )
    )

    messages: list[dict[str, str]] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "system", "content": context},
    ]
    # Keep the last turns only — the current form state is passed explicitly above
    for msg in payload.messages[-12:]:
        messages.append({"role": msg.role, "content": msg.content})

    try:
        raw = await post_chat_completion(messages, max_tokens=6000, temperature=0.3, timeout=120.0)
    except httpx.HTTPError as exc:
        logger.exception("OpenRouter HTTP error during AI form building")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="ИИ-сервис недоступен. Попробуйте ещё раз позже.",
        ) from exc
    except RuntimeError as exc:
        logger.exception("OpenRouter returned an invalid completion during AI form building")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="ИИ-сервис вернул пустой ответ. Попробуйте переформулировать запрос.",
        ) from exc

    parsed = _parse_payload(raw)
    if parsed is None:
        logger.warning("AI form builder: unparseable LLM output: %s", raw[:500])
        return FormAiBuildResponse(
            reply="Не удалось разобрать ответ ИИ. Попробуйте переформулировать запрос.",
        )

    pages = _sanitize_pages(parsed.get("pages"), known_ids)
    title_raw = parsed.get("title")
    title = _str(title_raw, 500) if isinstance(title_raw, str) and title_raw.strip() else None
    reply = _str(parsed.get("reply"), 4000)
    if not reply:
        reply = "Форма обновлена." if pages else "Готово."

    return FormAiBuildResponse(reply=reply, title=title, pages=pages)
