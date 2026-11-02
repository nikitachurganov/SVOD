"""Survey draft for an anonymous visitor of the landing: the AI survey builder, shown as a preview.

The landing draws only a few kinds of questions (one / several options, a 1–5 or 0–10 scale, a text
answer), so the generated fields are flattened out of pages and groups and mapped onto those kinds.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

from fastapi import HTTPException, status

from app.core.config import settings
from app.knowledge.methodologies import METHODOLOGIES
from app.schemas.landing_demo import LandingDemoQuestion, LandingDemoResponse, LandingDemoScaleLabels
from app.schemas.survey import SurveyAiBuildRequest
from app.services import survey_ai_builder_service

_SINGLE = ("single_choice", "Один вариант из списка")
_MULTIPLE = ("multiple_choice", "Несколько вариантов")
_ATTENTION = ("attention_check", "Ловушка внимания (контроль)")
_LONG_TEXT = ("open_text", "Развёрнутый ответ")
_SHORT_TEXT = ("open_text", "Короткий ответ")


def _flatten(fields: list[Any]) -> Iterator[dict[str, Any]]:
    for field in fields:
        if not isinstance(field, dict):
            continue
        if field.get("type") == "group":
            yield from _flatten(field.get("children") or [])
        elif field.get("type") != "textBlock":
            yield field


def _options(field: dict[str, Any]) -> list[str]:
    return [o["label"] for o in field.get("options") or [] if isinstance(o, dict) and o.get("label")]


def _question(field: dict[str, Any], number: int) -> LandingDemoQuestion:
    field_type = field.get("type")
    config = field.get("config") if isinstance(field.get("config"), dict) else {}
    options: list[str] | None = None
    scale: LandingDemoScaleLabels | None = None

    if config.get("attentionCheck"):
        kind, label = _ATTENTION
        options = _options(field)
    elif field_type in ("radio", "dropdown"):
        kind, label = _SINGLE
        options = _options(field)
    elif field_type == "checkbox":
        kind, label = _MULTIPLE
        options = _options(field)
    elif field_type == "yesNo":
        kind, label = _SINGLE
        options = ["Да", "Нет"]
    elif field_type == "rating":
        low, high = config.get("min", 1), config.get("max", 5)
        if config.get("ratingVariant") == "nps":
            kind, label = "scale_0_10", "Шкала NPS 0–10"
        elif isinstance(high, int) and high > 5:
            kind, label = "scale_0_10", "Шкала 0–10"
        else:
            kind, label = "likert_scale_5", "Шкала 1–5"
        left, right = config.get("leftLabel"), config.get("rightLabel")
        if left or right:
            scale = LandingDemoScaleLabels(
                min=f"{low} — {left}" if left else str(low),
                max=f"{high} — {right}" if right else str(high),
            )
    elif field_type == "longText":
        kind, label = _LONG_TEXT
    else:
        kind, label = _SHORT_TEXT

    return LandingDemoQuestion(
        id=str(field.get("id") or f"q{number}"),
        number=number,
        type=kind,
        typeLabel=label,
        text=str(field.get("label") or ""),
        options=options,
        scaleLabels=scale,
        required=bool(field.get("required", True)),
    )


def to_landing_questions(pages: list[dict[str, Any]]) -> list[LandingDemoQuestion]:
    fields = [f for page in pages for f in _flatten(page.get("fields") or [])]
    return [_question(field, number) for number, field in enumerate(fields, start=1)]


async def generate(prompt: str) -> LandingDemoResponse:
    built = await survey_ai_builder_service.build_survey(
        SurveyAiBuildRequest(messages=[{"role": "user", "content": prompt.strip()}]),
        max_questions=settings.LANDING_DEMO_MAX_QUESTIONS,
    )
    questions = to_landing_questions(built.pages or [])
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="ИИ не смог составить анкету. Попробуйте переформулировать запрос.",
        )

    meta = built.methodology_meta or {}
    names = [METHODOLOGIES[m].name for m in meta.get("methodologies", []) if m in METHODOLOGIES]
    summary = built.methodology_summary
    return LandingDemoResponse(
        draft_id=f"draft_{uuid.uuid4().hex[:12]}",
        title=built.title or prompt.strip()[:120],
        methodology=", ".join(names) or "Методология СВОД",
        description=(summary.standards_note if summary else "")
        or "Анкета составлена ИИ-методологом СВОД.",
        total_questions=len(questions),
        questions=questions,
        ai_summary=built.reply,
    )
