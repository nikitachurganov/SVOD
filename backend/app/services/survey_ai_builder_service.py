"""Build / edit a survey from a chat conversation: pick research methodologies, then generate.

Pipeline:
  1. methodology selection (LLM, constrained to ids from the catalogue) — skipped when the user
     picked the set explicitly or the survey was already generated;
  2. generation (LLM) with the rules of the selected methodologies injected into the prompt;
  3. standardised blocks (NPS, SUS, attention check, ...) inserted by code, never by the model;
  4. sanitising and rule-based linting of the wording.
"""

from __future__ import annotations

import copy
import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.knowledge import survey_templates
from app.knowledge.methodologies import CATALOG_VERSION, CATEGORIES, METHODOLOGIES
from app.schemas.survey import SurveyAiBuildRequest, SurveyAiBuildResponse
from app.services import survey_methodology_service
from app.services.form_ai_builder_service import (
    FIELD_TYPE_DESCRIPTIONS,
    SURVEY_FIELD_TYPE_DESCRIPTIONS,
    _collect_ids,
    _compact_pages,
    _parse_payload,
    _sanitize_pages,
    _str,
)
from app.services.openrouter_client import post_chat_completion

logger = logging.getLogger(__name__)

MAX_METHODOLOGIES = 3
# Respondents are anonymous and cannot upload files / use address suggestions
_UNSUPPORTED_SURVEY_TYPES = frozenset(
    {"file_vector", "file_image", "file_document", "address", "address_country_city", "location"}
)
_ALL_METHOD_IDS = frozenset(METHODOLOGIES)

def _select_prompt(allowed: frozenset[str] | None = None) -> str:
    """The selection prompt; with ``allowed`` the model sees only the methodologies of the plan."""
    methods = [m for m in METHODOLOGIES.values() if allowed is None or m.id in allowed]
    categories = [c for c in CATEGORIES.values() if any(m.category == c.id for m in methods)]
    academic = ", ".join(m.id for m in methods if m.category == "academic_survey")
    return f"""Ты — методолог исследований в сервисе «СВОД». По описанию пользователя определи, \
какой опрос ему нужен, и подбери подходящие методики из каталога.

Направления (category):
{chr(10).join(f"- {c.id}: {c.name}. {c.goal}" for c in categories)}

Каталог методик (id: название — когда применять):
{chr(10).join(f"- {m.id} [{m.category}]: {m.name} — {m.when_to_use}" for m in methods)}

Правила:
- Выбери ОДНО направление и от 1 до {MAX_METHODOLOGIES} методик, которые действительно подходят. \
Не набирай методики для количества.
- Используй только id из каталога.
- Для курсовых, дипломов и научных работ выбирай academic_survey (методики {academic}).
- goals — 1–4 коротких цели опроса на русском.
- subject — что оценивается, в форме родительного падежа без предлога, чтобы подставить в «оценка …» \
(например: «работы вуза», «сервиса доставки», «сайта кафедры»). Если неясно — пустая строка.

Отвечай ТОЛЬКО валидным JSON без markdown:
{{"category": "<id>", "goals": ["..."], "methodologies": ["<id>", ...], "subject": "..."}}
"""


_SELECT_PROMPT = _select_prompt()


def _build_generation_prompt(
    method_ids: list[str], subject: str, max_questions: int | None = None
) -> str:
    # The plan's question limit is told to the model, so it does not build what cannot be saved
    limit = min(30, max_questions) if max_questions else 30
    usual = f"8–{min(20, limit)}"
    type_lines = "\n".join(
        f"- {k}: {v}"
        for k, v in {**FIELD_TYPE_DESCRIPTIONS, **SURVEY_FIELD_TYPE_DESCRIPTIONS}.items()
        if k not in _UNSUPPORTED_SURVEY_TYPES
    )
    rules = "\n\n".join(
        f"### {METHODOLOGIES[mid].name} (methodology=\"{mid}\")\n{METHODOLOGIES[mid].generation_rules}"
        for mid in method_ids
    )
    return f"""Ты — ИИ-конструктор исследовательских опросов в сервисе «СВОД». Респонденты заполняют \
опрос анонимно по ссылке, поэтому не спрашивай ФИО, телефон и почту, если пользователь прямо об этом \
не просил. Ты собираешь опрос ТОЛЬКО из доступных типов полей.

Доступные типы полей (значение type → назначение):
{type_lines}

Структура поля:
{{
  "id": "<id существующего поля, если оно сохраняется; для нового поля не указывай>",
  "type": "<один из типов выше>",
  "label": "<формулировка вопроса на русском>",
  "description": "<пояснение для респондента, можно пустую строку>",
  "required": true | false,
  "options": ["Вариант 1", "Вариант 2"],      // только для dropdown, radio, checkbox
  "config": {{ ... }},                         // только для rating и location
  "methodology": "<id методики, по правилам которой написан вопрос, или не указывай>",
  "children": [ ...поля... ]                   // только для group; группы нельзя вкладывать в группы
}}
config для rating: {{"ratingVariant": "stars"|"numeric_scale"|"slider"|"nps", "min": 1, "max": 5, "step": 1, \
"leftLabel": "", "rightLabel": ""}}.

Предмет оценки: {subject or "не указан"}.

Методики, по которым нужно составить опрос, и их правила (обязательны к исполнению):

{rules}

Общие правила:
- Один вопрос — одна мысль. Без жаргона, наводящих формулировок и двойных отрицаний.
- Опрос должен быть коротким: обычно {usual} вопросов, не больше {limit}.
- Порядок: сначала лёгкие общие вопросы, затем основные, демография и классификационные вопросы — в конце.
- Закрытые вопросы: варианты взаимоисключающие и исчерпывающие, при необходимости добавляй вариант «Другое» \
или «Затрудняюсь ответить».
- Вопросы стандартизированных методик (NPS, CSAT, CES, SUS, UEQ, вопрос-ловушка) система добавляет сама — \
не создавай их.
- Если пользователь просит изменить текущий опрос — возьми его за основу, сохрани id неизменённых и \
изменённых полей, внеси только запрошенные изменения; блоки с methodology \
nps, csat, ces, sus, ueq, attention_check не меняй и не удаляй.
- Все тексты, включая варианты ответов, пиши на русском. Для вопроса с ответами «да / нет» используй тип yesNo, \
а не radio с вариантами yes и no.
- Не ставь двоеточие в конце формулировки вопроса.
- Тип textBlock используй только для пояснений между разделами. Приветственную страницу (первая страница без \
вопросов) система добавит сама: не создавай её, а напиши для неё текст в поле welcome.
- Если сообщение не требует изменения опроса (вопрос, уточнение) — верни "pages": null.

Отвечай ТОЛЬКО валидным JSON без markdown и пояснений вне JSON, строго в формате:
{{
  "reply": "<короткий ответ пользователю на русском: что сделано или уточняющий вопрос>",
  "title": "<название опроса или null, если менять не нужно>",
  "welcome": "<текст приветствия: 2–4 предложения — о чём исследование, благодарность за участие, анонимность; \
null, если пользователь правит уже готовый опрос>",
  "pages": [ {{ "title": "Страница 1", "fields": [ ...поля... ] }} ] | null
}}
"""


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _has_fields(pages: list[Any]) -> bool:
    return any(True for _ in survey_methodology_service.iter_leaf_fields(pages))


def _valid_method_ids(raw: Any, allowed: frozenset[str] | None = None) -> list[str]:
    """Catalogue ids only; with ``allowed`` (the free plan) also only the ones the plan includes."""
    if not isinstance(raw, list):
        return []
    ids: list[str] = []
    for item in raw:
        if (
            isinstance(item, str)
            and item in METHODOLOGIES
            and item not in ids
            and (allowed is None or item in allowed)
        ):
            ids.append(item)
    return ids[:MAX_METHODOLOGIES]


def _user_text(payload: SurveyAiBuildRequest) -> str:
    return "\n".join(m.content for m in payload.messages if m.role == "user")[-4000:]


async def _call_llm(messages: list[dict[str, str]], *, max_tokens: int, timeout: float) -> str:
    try:
        return await post_chat_completion(
            messages, max_tokens=max_tokens, temperature=0.3, timeout=timeout
        )
    except httpx.HTTPError as exc:
        logger.exception("OpenRouter HTTP error during AI survey building")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="ИИ-сервис недоступен. Попробуйте ещё раз позже.",
        ) from exc
    except RuntimeError as exc:
        logger.exception("OpenRouter returned an invalid completion during AI survey building")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="ИИ-сервис вернул пустой ответ. Попробуйте переформулировать запрос.",
        ) from exc


async def select_methodologies(
    user_text: str, allowed: frozenset[str] | None = None
) -> dict[str, Any]:
    """Stage 1: pick category, goals, methodologies and subject for the request."""
    raw = await _call_llm(
        [
            {
                "role": "system",
                "content": _SELECT_PROMPT if allowed is None else _select_prompt(allowed),
            },
            {"role": "user", "content": user_text},
        ],
        max_tokens=800,
        timeout=60.0,
    )
    parsed = _parse_payload(raw) or {}
    category = parsed.get("category")
    method_ids = _valid_method_ids(parsed.get("methodologies"), allowed)
    if not isinstance(category, str) or category not in CATEGORIES:
        category = METHODOLOGIES[method_ids[0]].category if method_ids else None
    goals_raw = parsed.get("goals")
    goals = (
        [_str(g, 200) for g in goals_raw[:4] if isinstance(g, str) and g.strip()]
        if isinstance(goals_raw, list)
        else []
    )
    return {
        "category": category,
        "goals": goals,
        "methodologies": method_ids,
        "subject": _str(parsed.get("subject"), 120),
    }


# ─── Restoring / inserting fixed content ──────────────────────────────────────

_KEEP_CONFIG_KEYS = ("attentionCheck", "attentionCorrect")


def _index_original_fields(pages: list[Any]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}

    def walk(fields: Any) -> None:
        if not isinstance(fields, list):
            return
        for f in fields:
            if isinstance(f, dict):
                if isinstance(f.get("id"), str):
                    index[f["id"]] = f
                walk(f.get("children"))

    for page in pages:
        if isinstance(page, dict):
            walk(page.get("fields"))
    return index


def _restore_configs(pages: list[dict[str, Any]], original_pages: list[Any]) -> None:
    """The generic sanitiser keeps only rating / location config — put back what the model
    could not have changed (attention check settings)."""
    original = _index_original_fields(original_pages)

    def walk(fields: list[dict[str, Any]]) -> None:
        for field in fields:
            prev = original.get(field.get("id", ""))
            if prev and prev.get("type") == field.get("type"):
                prev_config = prev.get("config")
                if isinstance(prev_config, dict):
                    kept = {k: prev_config[k] for k in _KEEP_CONFIG_KEYS if k in prev_config}
                    if kept:
                        field.setdefault("config", {}).update(kept)
            walk(field.get("children") or [])

    for page in pages:
        walk(page.get("fields") or [])


def _present_template_ids(pages: list[dict[str, Any]]) -> set[str]:
    present: set[str] = set()

    def walk(fields: list[dict[str, Any]]) -> None:
        for field in fields:
            config = field.get("config")
            if isinstance(config, dict) and isinstance(config.get("methodology"), str):
                present.add(config["methodology"])
            walk(field.get("children") or [])

    for page in pages:
        walk(page.get("fields") or [])
    return present


def insert_templates(
    pages: list[dict[str, Any]], method_ids: list[str], subject: str
) -> list[dict[str, Any]]:
    """Add the fixed blocks of selected methodologies that are not in the survey yet."""
    pages = copy.deepcopy(pages)
    present = _present_template_ids(pages)
    for mid in method_ids:
        template_id = METHODOLOGIES[mid].template
        if template_id is None or mid in present:
            continue
        block = survey_templates.TEMPLATES[template_id](subject)
        placement = survey_templates.TEMPLATE_PLACEMENT.get(template_id, "end")
        if not pages:
            pages.append({"title": "Страница 1", "fields": []})
        if placement == "own_page":
            pages.append(
                {
                    "title": survey_templates.TEMPLATE_PAGE_TITLES.get(template_id, "Оценка"),
                    "fields": block,
                }
            )
        elif placement == "middle":
            target = max(pages, key=lambda p: len(p["fields"]))
            position = max(1, len(target["fields"]) // 2)
            target["fields"][position:position] = block
        else:
            pages[-1]["fields"].extend(block)
    return pages


WELCOME_PAGE_TITLE = "Приветствие"
_DEFAULT_WELCOME = (
    "Спасибо, что согласились принять участие в исследовании! "
    "Ваши ответы помогут нам сделать выводы и улучшить результат."
)


def _is_welcome_page(page: dict[str, Any]) -> bool:
    fields = page.get("fields") or []
    return bool(fields) and all(f.get("type") == "textBlock" for f in fields)


def insert_welcome_page(pages: list[dict[str, Any]], *, text: str | None) -> list[dict[str, Any]]:
    """First page without questions: a greeting and thanks for taking part. Added by code so every
    generated survey has it, whatever the model returned."""
    if pages and _is_welcome_page(pages[0]):
        return pages
    questions = sum(1 for _ in survey_methodology_service.iter_leaf_fields(pages))
    minutes = max(1, round(questions / 2))
    body = (text or "").strip() or _DEFAULT_WELCOME
    body += (
        f"\n\nОпрос займёт около {minutes} мин. Ответы анонимны и будут использованы "
        "только в обобщённом виде. Нажмите «Далее», чтобы начать."
    )
    welcome = {
        "type": "textBlock",
        # The survey name is already shown above the form, so the heading is a plain greeting
        "label": "Добро пожаловать!",
        "placeholder": body,
        "required": False,
    }
    return [{"title": WELCOME_PAGE_TITLE, "fields": [welcome]}, *pages]


# ─── Public entrypoint ────────────────────────────────────────────────────────


async def build_survey(
    payload: SurveyAiBuildRequest,
    *,
    allowed_methodologies: frozenset[str] | None = None,
    max_questions: int | None = None,
) -> SurveyAiBuildResponse:
    """``allowed_methodologies`` and ``max_questions`` carry the plan's limits (None: no limit)."""
    existing_meta = payload.methodology_meta if isinstance(payload.methodology_meta, dict) else {}
    existing_ids = survey_methodology_service.method_ids_from_meta(existing_meta)
    explicit_ids = _valid_method_ids(payload.methodology_ids, allowed_methodologies)
    has_form = _has_fields(payload.pages)

    category: str | None = existing_meta.get("category")
    goals: list[str] = [g for g in existing_meta.get("goals", []) if isinstance(g, str)]
    subject = _str(existing_meta.get("subject"), 120)

    if explicit_ids:
        method_ids = explicit_ids
        if category not in CATEGORIES:
            category = METHODOLOGIES[method_ids[0]].category
    elif existing_ids and has_form:
        method_ids = existing_ids
    else:
        selected = await select_methodologies(_user_text(payload), allowed_methodologies)
        method_ids = selected["methodologies"]
        category = selected["category"]
        goals = selected["goals"]
        subject = selected["subject"]

    # Academic surveys always get an attention check
    if (
        category == "academic_survey"
        and "attention_check" not in method_ids
        and (allowed_methodologies is None or "attention_check" in allowed_methodologies)
    ):
        method_ids = [*method_ids, "attention_check"]

    current_pages = _compact_pages(payload.pages)
    known_ids = _collect_ids(payload.pages)
    context = "Текущий опрос (JSON):\n" + json.dumps(
        {"title": payload.title.strip() or None, "pages": current_pages}, ensure_ascii=False
    )
    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": _build_generation_prompt(method_ids, subject, max_questions),
        },
        {"role": "system", "content": context},
    ]
    for msg in payload.messages[-12:]:
        messages.append({"role": msg.role, "content": msg.content})

    raw = await _call_llm(messages, max_tokens=7000, timeout=120.0)
    parsed = _parse_payload(raw)
    if parsed is None:
        logger.warning("AI survey builder: unparseable LLM output: %s", raw[:500])
        return SurveyAiBuildResponse(
            reply="Не удалось разобрать ответ ИИ. Попробуйте переформулировать запрос.",
        )

    pages = _sanitize_pages(parsed.get("pages"), known_ids, _ALL_METHOD_IDS)
    if pages is not None:
        _restore_configs(pages, payload.pages)
    elif explicit_ids and has_form:
        # No generated changes, but the methodology set changed — keep the current form
        pages = _sanitize_pages(payload.pages, known_ids, _ALL_METHOD_IDS)
        if pages is not None:
            _restore_configs(pages, payload.pages)

    templates_added = False
    if pages is not None:
        before = _present_template_ids(pages)
        pages = insert_templates(pages, method_ids, subject)
        templates_added = _present_template_ids(pages) != before

    title_raw = parsed.get("title")
    title = _str(title_raw, 500) if isinstance(title_raw, str) and title_raw.strip() else None

    # A survey generated from scratch starts with a greeting page; edits keep the structure as is
    if pages is not None and not has_form:
        welcome_raw = parsed.get("welcome")
        pages = insert_welcome_page(
            pages, text=_str(welcome_raw, 1500) if isinstance(welcome_raw, str) else None
        )
    reply = _str(parsed.get("reply"), 4000)
    if not reply:
        reply = "Опрос обновлён." if pages else "Готово."
    if templates_added:
        reply += " Стандартные блоки методик добавлены автоматически."

    meta = {
        "catalog_version": CATALOG_VERSION,
        "category": category,
        "goals": goals,
        "subject": subject,
        "methodologies": method_ids,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    summary_pages: Any = pages if pages is not None else payload.pages
    return SurveyAiBuildResponse(
        reply=reply,
        title=title,
        pages=pages,
        methodology_meta=meta,
        methodology_summary=survey_methodology_service.build_summary(meta, summary_pages),
    )
