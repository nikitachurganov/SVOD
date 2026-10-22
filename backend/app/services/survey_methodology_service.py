"""Methodology summary and the full methodology report of a survey."""

from __future__ import annotations

from typing import Any

from app.knowledge.methodologies import CATALOG_VERSION, CATEGORIES, METHODOLOGIES
from app.knowledge.sources import SOURCES
from app.schemas.survey import (
    MethodologyCatalogCategory,
    MethodologyCatalogItem,
    MethodologyCatalogResponse,
    MethodologyItem,
    MethodologyReportResponse,
    MethodologySummary,
    MethodologyWarning,
)
from app.services.survey_linter import lint_pages

_CLOSED_TYPES = {"radio", "checkbox", "dropdown", "yesNo", "rating", "number"}
_OPEN_TYPES = {"shortText", "longText"}


def get_catalog() -> MethodologyCatalogResponse:
    return MethodologyCatalogResponse(
        version=CATALOG_VERSION,
        categories=[
            MethodologyCatalogCategory(id=c.id, name=c.name, goal=c.goal)
            for c in CATEGORIES.values()
        ],
        methodologies=[
            MethodologyCatalogItem(
                id=m.id,
                category_id=m.category,
                name=m.name,
                summary=m.summary,
                when_to_use=m.when_to_use,
            )
            for m in METHODOLOGIES.values()
        ],
    )


def iter_leaf_fields(pages: Any):
    if not isinstance(pages, list):
        return
    for page in pages:
        if not isinstance(page, dict):
            continue
        yield from _walk(page.get("fields"))


def _walk(fields: Any):
    if not isinstance(fields, list):
        return
    for field in fields:
        if not isinstance(field, dict):
            continue
        if field.get("type") == "group":
            yield from _walk(field.get("children"))
        else:
            yield field


def method_ids_from_meta(meta: dict[str, Any] | None) -> list[str]:
    if not isinstance(meta, dict):
        return []
    raw = meta.get("methodologies")
    if not isinstance(raw, list):
        return []
    ids: list[str] = []
    for item in raw:
        mid = item.get("id") if isinstance(item, dict) else item
        if isinstance(mid, str) and mid in METHODOLOGIES and mid not in ids:
            ids.append(mid)
    return ids


def count_questions_by_methodology(pages: Any) -> dict[str, int]:
    counts: dict[str, int] = {}
    for field in iter_leaf_fields(pages):
        config = field.get("config")
        tag = config.get("methodology") if isinstance(config, dict) else None
        if isinstance(tag, str):
            counts[tag] = counts.get(tag, 0) + 1
    return counts


def count_questions(pages: Any) -> int:
    return sum(1 for _ in iter_leaf_fields(pages))


def build_summary(meta: dict[str, Any] | None, pages: Any) -> MethodologySummary | None:
    ids = method_ids_from_meta(meta)
    if not ids:
        return None
    category_id = meta.get("category") if isinstance(meta, dict) else None
    category = CATEGORIES.get(category_id) if isinstance(category_id, str) else None
    counts = count_questions_by_methodology(pages)
    goals = meta.get("goals") if isinstance(meta, dict) else None
    clean_pages = [p for p in pages if isinstance(p, dict)] if isinstance(pages, list) else []
    warnings = [MethodologyWarning(**w) for w in lint_pages(clean_pages, ids)]
    return MethodologySummary(
        category_id=category.id if category else None,
        category_name=category.name if category else None,
        goals=[str(g) for g in goals if isinstance(g, str)] if isinstance(goals, list) else [],
        methodologies=[
            MethodologyItem(
                id=mid,
                name=METHODOLOGIES[mid].name,
                summary=METHODOLOGIES[mid].summary,
                questions_count=counts.get(mid, 0),
                survey_level=METHODOLOGIES[mid].survey_level,
            )
            for mid in ids
        ],
        warnings=warnings,
        standards_note=category.standards_note if category else "",
    )


def _structure_paragraph(pages: Any) -> str:
    fields = list(iter_leaf_fields(pages))
    if not fields:
        return ""
    closed = sum(1 for f in fields if f.get("type") in _CLOSED_TYPES)
    opened = sum(1 for f in fields if f.get("type") in _OPEN_TYPES)
    pages_count = len([p for p in pages if isinstance(p, dict)]) if isinstance(pages, list) else 0
    return (
        f"Анкета включает {len(fields)} вопросов на {pages_count} стр. "
        f"(закрытых и шкальных — {closed}, открытых — {opened})."
    )


def build_report(name: str, meta: dict[str, Any] | None, pages: Any) -> MethodologyReportResponse:
    ids = method_ids_from_meta(meta)
    category_id = meta.get("category") if isinstance(meta, dict) else None
    category = CATEGORIES.get(category_id) if isinstance(category_id, str) else None
    goals = meta.get("goals") if isinstance(meta, dict) else None
    goals_list = [str(g) for g in goals if isinstance(g, str)] if isinstance(goals, list) else []
    counts = count_questions_by_methodology(pages)

    title = f"Методология опроса «{name}»"
    lines: list[str] = [f"# {title}", ""]

    if category or goals_list:
        lines += ["## Цель и тип исследования", ""]
        if category:
            lines += [f"Тип исследования: {category.name}. {category.goal}", ""]
        if goals_list:
            lines += ["Задачи опроса:", ""] + [f"- {g}" for g in goals_list] + [""]

    structure = _structure_paragraph(pages)
    if structure:
        lines += ["## Структура инструмента", "", structure, ""]

    source_keys: list[str] = []

    def add_sources(keys: tuple[str, ...]) -> None:
        for key in keys:
            if key in SOURCES and key not in source_keys:
                source_keys.append(key)

    if ids:
        lines += ["## Использованные методики", ""]
        for index, mid in enumerate(ids, start=1):
            method = METHODOLOGIES[mid]
            lines += [f"### {index}. {method.name}", "", method.detailed, ""]
            if method.survey_level:
                lines += ["Применение в анкете: правила учтены при формулировке всех вопросов.", ""]
            elif counts.get(mid):
                lines += [f"Применение в анкете: вопросов по методике — {counts[mid]}.", ""]
            add_sources(method.sources)

    if category:
        add_sources(category.standards)
        if category.standards_note:
            lines += ["## Стандарты", "", category.standards_note, ""]

    bibliography = [SOURCES[k].citation for k in source_keys]
    has_unverified = any(not SOURCES[k].verified for k in source_keys)
    if bibliography:
        bibliography_sorted = sorted(bibliography, key=lambda c: c.lower())
        lines += ["## Список литературы", ""]
        lines += [f"{i}. {c}" for i, c in enumerate(bibliography_sorted, start=1)]
        lines.append("")
        bibliography = bibliography_sorted
    if has_unverified:
        lines += [
            "> Часть библиографических данных (отмечена в тексте уточнениями) составлена по "
            "рабочим материалам: сверьте издательство, год и название перевода с вашим "
            "экземпляром, прежде чем вставлять список в работу.",
            "",
        ]
    if not ids:
        lines += ["Для этого опроса методики не выбраны.", ""]

    return MethodologyReportResponse(
        title=title,
        markdown="\n".join(lines).rstrip() + "\n",
        bibliography=bibliography,
        has_unverified_sources=has_unverified,
    )
