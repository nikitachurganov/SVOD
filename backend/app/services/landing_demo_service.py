"""Survey draft for an anonymous visitor of the landing: the AI survey builder, shown as a preview.

The landing draws only a few kinds of questions (one / several options, a 1–5 or 0–10 scale, a text
answer), so the generated fields are flattened out of pages and groups and mapped onto those kinds.

The survey itself (pages as the editor needs them) is kept as a draft under a random token. The
button «continue in the service» leads to that token; after signing in (or up) the person takes the
draft into their account as an ordinary survey, once.
"""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.knowledge.methodologies import METHODOLOGIES
from app.models.landing_demo_draft import LandingDemoDraft
from app.models.user import User
from app.schemas.landing_demo import LandingDemoQuestion, LandingDemoResponse, LandingDemoScaleLabels
from app.schemas.survey import CreateSurveyRequest, SurveyAiBuildRequest, SurveyDetail
from app.services import survey_ai_builder_service, survey_service

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


def _ttl() -> timedelta:
    return timedelta(days=settings.LANDING_DEMO_DRAFT_TTL_DAYS)


async def _save_draft(
    session: AsyncSession, prompt: str, title: str, pages: list[Any], meta: dict[str, Any] | None
) -> str:
    now = datetime.now(timezone.utc)
    # Expired drafts nobody took are of no use; each new one sweeps them away
    await session.execute(
        delete(LandingDemoDraft).where(
            LandingDemoDraft.created_at < now - _ttl(), LandingDemoDraft.survey_id.is_(None)
        )
    )
    token = secrets.token_urlsafe(18)
    session.add(
        LandingDemoDraft(
            id=token, prompt=prompt, title=title, pages=pages, methodology_meta=meta, created_at=now
        )
    )
    await session.commit()
    return token


async def generate(session: AsyncSession, prompt: str) -> LandingDemoResponse:
    prompt = prompt.strip()
    built = await survey_ai_builder_service.build_survey(
        SurveyAiBuildRequest(messages=[{"role": "user", "content": prompt}]),
        max_questions=settings.LANDING_DEMO_MAX_QUESTIONS,
    )
    questions = to_landing_questions(built.pages or [])
    if not questions:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="ИИ не смог составить анкету. Попробуйте переформулировать запрос.",
        )

    title = built.title or prompt[:120]
    draft_id = await _save_draft(session, prompt, title, built.pages or [], built.methodology_meta)
    meta = built.methodology_meta or {}
    names = [METHODOLOGIES[m].name for m in meta.get("methodologies", []) if m in METHODOLOGIES]
    summary = built.methodology_summary
    return LandingDemoResponse(
        draft_id=draft_id,
        title=title,
        methodology=", ".join(names) or "Методология СВОД",
        description=(summary.standards_note if summary else "")
        or "Анкета составлена ИИ-методологом СВОД.",
        total_questions=len(questions),
        questions=questions,
        ai_summary=built.reply,
    )


async def create_survey_from_draft(
    session: AsyncSession, user: User, draft_id: str, organization_id: str
) -> SurveyDetail:
    """The draft becomes a survey of the person; opening the link again leads to the same survey."""
    draft = await session.get(LandingDemoDraft, draft_id)
    if draft is not None and draft.survey_id is not None:
        if draft.claimed_by_user_id == user.id:
            return await survey_service.get_survey(session, user, str(draft.survey_id))
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Этот черновик уже перенесён в другой аккаунт.",
        )
    if draft is None or draft.created_at < datetime.now(timezone.utc) - _ttl():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Черновик не найден или устарел. Составьте опрос заново.",
        )

    survey = await survey_service.create_survey(
        session,
        user,
        CreateSurveyRequest(
            organization_id=organization_id,
            name=draft.title,
            pages=draft.pages,
            methodology_meta=draft.methodology_meta,
        ),
    )
    draft.survey_id = uuid.UUID(survey.id)
    draft.claimed_by_user_id = user.id
    await session.commit()
    return survey
