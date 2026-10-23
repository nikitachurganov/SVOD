"""Quality of a filled-in survey: which signals exist, how strong they are, and how to explain them.

A signal is stored as a key in ``SurveyResponse.quality_flags`` (JSONB). Answers are never changed
or dropped because of a signal — the flags only decide what the analytics count by default and what
the researcher is told about a response.

Signals and how much they are trusted:

* ``failed_attention_check`` (strong) — the control question of the survey was answered wrongly.
  It exists only in surveys that contain such a question; nothing is imitated for the others.
* ``too_fast`` (strong) — the form was filled in faster than the questions can be read.
* ``straight_lining`` (weak) — one and the same option in a block of five or more questions on
  the same scale. Honest respondents sometimes do this, so it never excludes a response by itself:
  the response is only marked "needs a look".

Not implemented because the data for it does not exist: time per question, contradictions between
related questions (needs explicit pairs in the form), repeated submissions from one device.

To add a signal: put its key into ``STRONG_FLAGS`` or ``WEAK_FLAGS``, detect it in ``detect_flags``
and explain it in ``_explain_one``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.services import survey_answers
from app.services.survey_answers import answerable_fields, is_empty

STRONG_FLAGS = ("failed_attention_check", "too_fast")
WEAK_FLAGS = ("straight_lining",)
# Fewer items cannot tell a straight line from a coincidence
MIN_BLOCK_ITEMS = 5

QualityStatus = Literal["ok", "review", "flagged"]
Severity = Literal["strong", "weak"]


@dataclass(frozen=True)
class QualityReason:
    code: str
    severity: Severity
    title: str
    explanation: str
    field_ids: list[str] = field(default_factory=list)


# ─── Status and exclusion ─────────────────────────────────────────────────────


def _active(flags: dict[str, Any] | None) -> list[str]:
    return [key for key, value in (flags or {}).items() if value]


def status_of(flags: dict[str, Any] | None) -> QualityStatus:
    """flagged — a strong signal; review — only weak ones; ok — none.

    A flag this module does not know (an older format) counts as strong: that is how every flag
    behaved before the weak ones existed.
    """
    active = _active(flags)
    if not active:
        return "ok"
    return "review" if all(key in WEAK_FLAGS for key in active) else "flagged"


def excludes_from_analysis(flags: dict[str, Any] | None) -> bool:
    return status_of(flags) == "flagged"


# ─── Detection ────────────────────────────────────────────────────────────────


def _scale_signature(f: dict[str, Any]) -> tuple[Any, ...] | None:
    """Questions answered on the same scale share a signature; others have none."""
    config = f.get("config") if isinstance(f.get("config"), dict) else {}
    if config.get("attentionCheck"):
        return None
    ftype = f.get("type")
    if ftype == "rating":
        return ("rating", config.get("min"), config.get("max"))
    if ftype in ("radio", "dropdown"):
        labels = tuple(
            str(o.get("label", "")).strip().lower()
            for o in f.get("options") or []
            if isinstance(o, dict)
        )
        # Two options (yes / no) are not a scale
        return ("choice", labels) if len(labels) >= 3 else None
    return None


def straight_lining_blocks(pages: Any, answers: dict[str, Any]) -> list[list[dict[str, Any]]]:
    """Blocks of >= 5 answered questions on one scale where every answer is the same."""
    groups: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for f in answerable_fields(pages):
        signature = _scale_signature(f)
        if signature is not None:
            groups.setdefault(signature, []).append(f)
    blocks: list[list[dict[str, Any]]] = []
    for items in groups.values():
        answered = [f for f in items if not is_empty(answers.get(f["id"]))]
        if len(answered) < MIN_BLOCK_ITEMS:
            continue
        if len({_chosen_key(f, answers[f["id"]]) for f in answered}) == 1:
            blocks.append(answered)
    return blocks


def _chosen_key(f: dict[str, Any], value: Any) -> str:
    """What was chosen, comparable between questions: options have a separate id in every question,
    so the chosen option is compared by its label."""
    if isinstance(value, dict) and "value" in value:
        value = value["value"]  # a rating answer: {"value": 5, "min": 1, "max": 5}
    text = str(value).strip().lower()
    for option in f.get("options") or []:
        if isinstance(option, dict) and str(option.get("id", "")).strip().lower() == text:
            return str(option.get("label", "")).strip().lower()
    return text


def detect_flags(
    pages: Any, answers: dict[str, Any], duration_seconds: int | None
) -> dict[str, Any] | None:
    flags: dict[str, Any] = dict(survey_answers.quality_flags(pages, answers, duration_seconds) or {})
    if straight_lining_blocks(pages, answers):
        flags["straight_lining"] = True
    return flags or None


# ─── Explanation ──────────────────────────────────────────────────────────────


def _label(f: dict[str, Any]) -> str:
    return str(f.get("label") or f["id"])


def _shown_answer(f: dict[str, Any], value: Any) -> str:
    if is_empty(value):
        return "ничего"
    labels = {
        o["id"]: str(o.get("label", ""))
        for o in f.get("options") or []
        if isinstance(o, dict) and isinstance(o.get("id"), str)
    }
    values = value if isinstance(value, list) else [value]
    return ", ".join(labels.get(str(v), str(v)) for v in values)


def _explain_attention(pages: Any, answers: dict[str, Any]) -> QualityReason:
    failed: list[dict[str, Any]] = []
    parts: list[str] = []
    for f in answerable_fields(pages):
        config = f.get("config")
        if not (isinstance(config, dict) and config.get("attentionCheck")):
            continue
        correct = config.get("attentionCorrect")
        if not isinstance(correct, str):
            continue
        value = answers.get(f["id"])
        if is_empty(value) or not survey_answers._option_matches(f, value, correct):
            failed.append(f)
            parts.append(
                f"в вопросе «{_label(f)}» нужно было выбрать «{correct}», выбрано: «{_shown_answer(f, value)}»"
            )
    explanation = (
        "Контрольный вопрос отвечен не так, как просила анкета: " + "; ".join(parts) + "."
        if parts
        else "Контрольный вопрос анкеты отвечен неверно."
    )
    return QualityReason(
        code="failed_attention_check",
        severity="strong",
        title="Не пройдена проверка внимания",
        explanation=explanation,
        field_ids=[f["id"] for f in failed],
    )


def _explain_fast(pages: Any, duration_seconds: int | None) -> QualityReason:
    questions = len(answerable_fields(pages))
    threshold = survey_answers.too_fast_threshold(questions)
    spent = "не указано" if duration_seconds is None else f"{duration_seconds} с"
    return QualityReason(
        code="too_fast",
        severity="strong",
        title="Слишком быстрое заполнение",
        explanation=(
            f"Время заполнения: {spent}. Для {questions} вопросов это меньше порога в "
            f"{threshold:g} с (около 1,5 с на вопрос) — так быстро прочитать вопросы нельзя."
        ),
    )


def _explain_straight_lining(pages: Any, answers: dict[str, Any]) -> QualityReason:
    blocks = straight_lining_blocks(pages, answers)
    parts = [
        f"{len(block)} вопросов с одной шкалой отвечены одинаково («{_shown_answer(block[0], answers[block[0]['id']])}»)"
        for block in blocks
    ]
    explanation = (
        "; ".join(parts) + ". Так бывает при невнимательном заполнении, но это может "
        "быть и честный ответ: сигнал слабый, сам по себе он не исключает ответ из аналитики."
        if parts
        else "Однообразные ответы в блоке вопросов с одной шкалой. Сигнал слабый и ответ не исключает."
    )
    return QualityReason(
        code="straight_lining",
        severity="weak",
        title="Однообразные ответы в шкале",
        explanation=explanation,
        field_ids=[f["id"] for block in blocks for f in block],
    )


def _explain_one(
    code: str, pages: Any, answers: dict[str, Any], duration_seconds: int | None
) -> QualityReason:
    if code == "failed_attention_check":
        return _explain_attention(pages, answers)
    if code == "too_fast":
        return _explain_fast(pages, duration_seconds)
    if code == "straight_lining":
        return _explain_straight_lining(pages, answers)
    return QualityReason(
        code=code,
        severity="strong",
        title="Замечание по качеству",
        explanation="Причина сохранена в старом формате и без подробностей.",
    )


def explain(
    pages: Any,
    answers: dict[str, Any],
    duration_seconds: int | None,
    flags: dict[str, Any] | None,
) -> list[QualityReason]:
    """Reasons behind the stored flags, strong ones first. ``pages`` is the form the respondent saw."""
    reasons = [_explain_one(code, pages, answers, duration_seconds) for code in _active(flags)]
    return sorted(reasons, key=lambda r: r.severity != "strong")
