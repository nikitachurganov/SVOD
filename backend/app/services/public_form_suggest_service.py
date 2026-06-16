"""Match free-text task description to form templates via LLM (public suggest)."""

from __future__ import annotations

import json
import logging
import re
import uuid

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.form import Form
from app.repositories import form_repository, public_link_repository
from app.schemas.public_link import PublicSuggestedFormCard, PublicSuggestFormsResponse
from app.services.gigachat_client import post_chat_completion, strip_json_fence
from app.services.request_analysis_parser import extract_first_json_object

logger = logging.getLogger(__name__)

_WORD_SPLIT = re.compile(r"\s+")
# Words: Cyrillic, Latin, digits (for "2x2", sizes, etc.)
_TOKEN_RE = re.compile(r"[0-9A-Za-zА-Яа-яЁё]+", re.UNICODE)

_HINT_LEXICAL = (
    "Точного совпадения по каталогу не найдено — ниже варианты по ключевым словам из вашего описания."
)
_HINT_POPULAR = (
    "Не удалось сопоставить описание с типами заявок — показаны самые популярные формы. "
    "Выберите ближайшую или уточните задачу."
)


def count_words(text: str) -> int:
    stripped = text.strip()
    if not stripped:
        return 0
    return len([w for w in _WORD_SPLIT.split(stripped) if w])


def _count_leaf_fields(fields: list | None) -> int:
    if not isinstance(fields, list):
        return 0
    total = 0
    for field in fields:
        if not isinstance(field, dict):
            continue
        if field.get("type") == "group":
            total += _count_leaf_fields(field.get("children"))
        else:
            total += 1
    return total


def count_form_fields(form: Form) -> int:
    pages = form.fields if isinstance(form.fields, list) else []
    total = 0
    for page in pages:
        if isinstance(page, dict):
            total += _count_leaf_fields(page.get("fields"))
    return total


def _form_to_card(
    form: Form,
    *,
    relevance_score: float,
    reason: str,
) -> PublicSuggestedFormCard:
    return PublicSuggestedFormCard(
        id=str(form.id),
        name=form.name,
        short_description=_truncate(form.description, 80),
        field_count=count_form_fields(form),
        relevance_score=round(max(0.0, min(1.0, relevance_score)), 2),
        reason=reason,
    )


def _truncate(text: str | None, limit: int = 80) -> str:
    t = (text or "").strip()
    if len(t) <= limit:
        return t
    return t[: limit - 1].rstrip() + "…"


def _walk_field_labels(fields: list | None, parts: list[str], budget: int) -> int:
    """Extract labels/descriptions from form builder JSON; returns remaining char budget."""
    if not isinstance(fields, list) or budget <= 0:
        return budget
    for field in fields:
        if not isinstance(field, dict):
            continue
        lab = field.get("label")
        if isinstance(lab, str) and lab.strip():
            s = lab.strip()
            parts.append(s)
            budget -= len(s) + 1
        desc = field.get("description")
        if isinstance(desc, str) and desc.strip():
            s = desc.strip()[:300]
            parts.append(s)
            budget -= len(s) + 1
        children = field.get("children")
        if isinstance(children, list) and children:
            budget = _walk_field_labels(children, parts, budget)
        if budget <= 0:
            break
    return budget


def _form_schema_text_for_match(form: Form, max_chars: int = 3500) -> str:
    """Page titles and field labels often contain e.g. 'баннер', 'визитки'."""
    parts: list[str] = []
    budget = max_chars
    pages = form.fields
    if isinstance(pages, list):
        for page in pages:
            if not isinstance(page, dict):
                continue
            title = page.get("title")
            if isinstance(title, str) and title.strip():
                s = title.strip()
                parts.append(s)
                budget -= len(s) + 1
            budget = _walk_field_labels(page.get("fields"), parts, budget)
            if budget <= 0:
                break
    return " ".join(parts)


def _form_match_corpus(form: Form) -> str:
    """All searchable text: name, description, schema labels."""
    blob = _form_schema_text_for_match(form)
    desc = (form.description or "").strip()
    return f"{form.name} {desc} {blob}".lower()


def _tokenize_for_match(text: str) -> list[str]:
    """Tokens from user text; drop very short noise."""
    raw = _TOKEN_RE.findall(text.lower())
    stop = frozenset(
        {
            "на",
            "во",
            "в",
            "и",
            "или",
            "для",
            "по",
            "из",
            "к",
            "от",
            "до",
            "не",
            "нет",
            "да",
            "нужен",
            "нужна",
            "нужно",
            "нужны",
            "заявка",
            "прошу",
            "пожалуйста",
        }
    )
    out: list[str] = []
    for t in raw:
        if len(t) < 2:
            continue
        if t in stop:
            continue
        out.append(t)
    return out


def _hay_tokens(hay: str) -> set[str]:
    return set(_TOKEN_RE.findall(hay.lower()))


def _token_hits_form(tok: str, hay_words: set[str], hay_raw: str) -> int:
    """Score contribution if token matches form text (name, description, field labels)."""
    if len(tok) < 2:
        return 0
    best = 0
    if tok in hay_words:
        best = len(tok)
    elif tok in hay_raw:
        best = max(len(tok) - 1, 2)
    # Shared prefix (e.g. владивостоке vs владивосток)
    if len(tok) >= 4:
        for hw in hay_words:
            if len(hw) < 4:
                continue
            n = min(len(tok), len(hw), 5)
            if tok[:n] == hw[:n]:
                best = max(best, n)
    # Prefix / substring (e.g. автомобильную vs авто; баннер vs баннеры)
    if len(tok) >= 3:
        for hw in hay_words:
            if len(hw) < 3:
                continue
            if tok.startswith(hw) or hw.startswith(tok):
                best = max(best, min(len(tok), len(hw), 8))
            elif len(tok) >= 4 and len(hw) >= 4:
                shorter = tok if len(tok) <= len(hw) else hw
                longer = hw if len(tok) <= len(hw) else tok
                if shorter in longer:
                    best = max(best, len(shorter))
    return best


def _lexical_scores(text: str, forms: list[Form]) -> list[tuple[Form, int]]:
    tokens = _tokenize_for_match(text)
    if not tokens:
        return []
    scored: list[tuple[Form, int]] = []
    for f in forms:
        hay_raw = _form_match_corpus(f)
        hay_words = _hay_tokens(hay_raw)
        score = 0
        for tok in tokens:
            score += _token_hits_form(tok, hay_words, hay_raw)
        if score:
            scored.append((f, score))
    scored.sort(key=lambda x: (-x[1], -x[0].usage_count, x[0].name))
    return scored


def _forms_to_cards(
    forms: list[Form],
    *,
    base_score: float = 0.7,
    reason: str = "Подходит по описанию вашей задачи",
) -> list[PublicSuggestedFormCard]:
    cards: list[PublicSuggestedFormCard] = []
    for index, form in enumerate(forms[:3]):
        score = max(0.35, base_score - index * 0.12)
        cards.append(_form_to_card(form, relevance_score=score, reason=reason))
    return cards


def _parse_llm_payload(raw: str) -> dict | None:
    cleaned = strip_json_fence(raw.strip())
    chunk = extract_first_json_object(cleaned)
    if chunk:
        try:
            obj = json.loads(chunk)
            if isinstance(obj, dict):
                return obj
        except (json.JSONDecodeError, ValueError):
            pass
    try:
        obj = json.loads(cleaned)
        if isinstance(obj, dict):
            return obj
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def _extract_form_id_list(payload: dict) -> list[str]:
    for key in ("form_ids", "formIds", "ids", "recommended_form_ids", "forms"):
        v = payload.get(key)
        if not isinstance(v, list):
            continue
        out: list[str] = []
        for item in v:
            if isinstance(item, dict) and "id" in item:
                sid = str(item.get("id", "")).strip()
            else:
                sid = str(item).strip()
            if sid:
                out.append(sid)
        if out:
            return out
    return []


def _blend_lexical_top_into_cards(
    cards: list[PublicSuggestedFormCard],
    candidates: list[Form],
    text: str,
    min_score: int = 4,
) -> list[PublicSuggestedFormCard]:
    """If LLM missed a strong keyword match, surface it first."""
    if not cards:
        return cards
    ranked = _lexical_scores(text, candidates)
    if not ranked:
        return cards
    top_f, top_s = ranked[0]
    if top_s < min_score:
        return cards
    ids = {c.id for c in cards}
    if str(top_f.id) in ids:
        return cards
    extra = _form_to_card(
        top_f,
        relevance_score=0.82,
        reason="Совпадение по ключевым словам из вашего описания",
    )
    rest = [c for c in cards if c.id != extra.id]
    return [extra, *rest[:2]]


def _cards_from_llm_ids(
    ids_raw: list[str], candidates: list[Form]
) -> list[PublicSuggestedFormCard]:
    valid_ids = {str(f.id) for f in candidates}
    picked: list[uuid.UUID] = []
    for item in ids_raw[:8]:
        sid = str(item).strip()
        if sid in valid_ids and sid not in {str(x) for x in picked}:
            picked.append(uuid.UUID(sid))
        if len(picked) >= 3:
            break
    by_id = {str(f.id): f for f in candidates}
    cards: list[PublicSuggestedFormCard] = []
    for index, pid in enumerate(picked):
        f = by_id.get(str(pid))
        if f is None:
            continue
        score = max(0.45, 0.95 - index * 0.15)
        cards.append(
            _form_to_card(
                f,
                relevance_score=score,
                reason="Рекомендовано на основе анализа вашего описания",
            )
        )
    return cards


def _fallback_cards(
    text: str, candidates: list[Form]
) -> tuple[list[PublicSuggestedFormCard], str | None]:
    """When LLM returns nothing or fails: keyword match, then popularity."""
    lexical = _lexical_scores(text, candidates)
    if lexical:
        forms = [f for f, _s in lexical[:3]]
        return (
            _forms_to_cards(
                forms,
                base_score=0.78,
                reason="Совпадение по ключевым словам из вашего описания",
            ),
            _HINT_LEXICAL,
        )
    ranked = sorted(candidates, key=lambda f: (-f.usage_count, f.name))
    return (
        _forms_to_cards(
            ranked[:3],
            base_score=0.55,
            reason="Популярная форма среди заявок организации",
        ),
        _HINT_POPULAR,
    )


async def suggest_forms_for_public_token(
    session: AsyncSession, token: str, text: str
) -> PublicSuggestFormsResponse:
    link = await public_link_repository.get_by_token(session, token)
    if link is None:
        inactive = await public_link_repository.get_by_token_any(session, token)
        if inactive is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="link_not_found",
            )
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="link_inactive",
        )

    forms = await form_repository.get_active_by_org(session, link.organization_id)
    # Prefer matching specialized templates; universal is a separate fallback in UI.
    candidates = [f for f in forms if not f.is_universal]
    if not candidates:
        candidates = list(forms)

    stripped = text.strip()
    if len(stripped) < 10:
        return PublicSuggestFormsResponse(
            forms=[],
            hint="Опишите задачу подробнее (минимум 10 символов)",
            used_llm=False,
        )

    if not candidates:
        return PublicSuggestFormsResponse(forms=[], hint=None, used_llm=False)

    catalog = []
    for f in candidates:
        schema_hint = _form_schema_text_for_match(f, max_chars=1200)
        desc = (f.description or "").strip()
        if schema_hint:
            combined = (
                f"{desc}\nПоля формы: {schema_hint}" if desc else f"Поля формы: {schema_hint}"
            )
        else:
            combined = desc
        catalog.append(
            {
                "id": str(f.id),
                "name": f.name,
                "description": combined[:2000],
            }
        )

    user_prompt = (
        "Задача пользователя (описание):\n"
        f"{text.strip()[:8000]}\n\n"
        "Доступные типы заявок (JSON-массив):\n"
        f"{json.dumps(catalog, ensure_ascii=False)}\n\n"
        'Верни ТОЛЬКО JSON объекта вида {"form_ids": ["id1","id2"]} '
        "с не более чем тремя id из списка выше, в порядке убывания релевантности.\n"
        "В каталоге есть хотя бы один тип — не возвращай пустой form_ids: "
        "выбери до трёх наиболее близких по смыслу (реклама, печать, дизайн, закупка, ИТ и т.д.), "
        "даже если совпадение не идеальное."
    )

    messages = [
        {
            "role": "system",
            "content": (
                "Ты помощник сервиса приёма заявок в организации. "
                "Тебе дают текст задачи пользователя и каталог типовых форм заявок. "
                "Выбери до трёх наиболее подходящих типов по смыслу (название и описание формы). "
                "Пустой список id допустим только если каталог пуст. "
                "Отвечай только JSON без markdown и пояснений."
            ),
        },
        {"role": "user", "content": user_prompt},
    ]

    llm_called = False
    raw = ""
    try:
        llm_called = True
        raw = await post_chat_completion(messages, max_tokens=400, temperature=0.15)
    except httpx.HTTPError:
        logger.exception("GigaChat HTTP error during public form suggestion")
        fb_cards, fb_hint = _fallback_cards(text, candidates)
        return PublicSuggestFormsResponse(forms=fb_cards, hint=fb_hint, used_llm=True)
    except Exception:
        logger.exception("Unexpected error during public form suggestion")
        fb_cards, fb_hint = _fallback_cards(text, candidates)
        return PublicSuggestFormsResponse(forms=fb_cards, hint=fb_hint, used_llm=True)

    payload = _parse_llm_payload(raw) if raw else None
    cards: list[PublicSuggestedFormCard] = []
    if isinstance(payload, dict):
        ids_raw = _extract_form_id_list(payload)
        cards = _cards_from_llm_ids(ids_raw, candidates)

    if not cards:
        logger.warning(
            "Public form suggestion: empty or unparseable LLM result, using fallback. raw=%s",
            (raw or "")[:400],
        )
        fb_cards, fb_hint = _fallback_cards(text, candidates)
        return PublicSuggestFormsResponse(forms=fb_cards, hint=fb_hint, used_llm=llm_called)

    cards = _blend_lexical_top_into_cards(cards, candidates, text)
    return PublicSuggestFormsResponse(forms=cards, hint=None, used_llm=True)
