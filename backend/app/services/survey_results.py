"""Aggregation of survey responses: per-question statistics and standardised metrics.

Pure functions over the survey pages and response rows, so they are testable without a database.
The metrics rely on the fixed question blocks from ``app.knowledge.survey_templates`` (the fields
carry ``config.methodology``), which is why NPS / CSAT / CES / SUS / UEQ can be computed reliably.
"""

from __future__ import annotations

from typing import Any

from app.schemas.survey import (
    MetricResult,
    QuestionOptionStat,
    QuestionStat,
    ScaleBucket,
    SurveyResults,
)
from app.services.survey_answers import answerable_fields, is_empty

OTHER_PREFIX = "__other__:"
MAX_TEXT_SAMPLES = 10
SCALE_TYPES = {"rating", "number"}
CHOICE_TYPES = {"radio", "checkbox", "dropdown", "yesNo"}

# UEQ items in the order of ``survey_templates.UEQ_PAIRS``: (scale, positive pole is on the right)
UEQ_ITEMS: list[tuple[str, bool]] = [
    ("attractiveness", True),
    ("perspicuity", True),
    ("novelty", False),
    ("perspicuity", False),
    ("stimulation", False),
    ("stimulation", True),
    ("stimulation", True),
    ("dependability", True),
    ("efficiency", False),
    ("novelty", False),
    ("dependability", True),
    ("attractiveness", False),
    ("perspicuity", True),
    ("attractiveness", True),
    ("novelty", True),
    ("attractiveness", True),
    ("dependability", False),
    ("stimulation", False),
    ("dependability", False),
    ("efficiency", True),
    ("perspicuity", False),
    ("efficiency", True),
    ("efficiency", False),
    ("attractiveness", False),
    ("attractiveness", False),
    ("novelty", True),
]
UEQ_SCALE_NAMES = {
    "attractiveness": "Привлекательность",
    "perspicuity": "Ясность",
    "efficiency": "Эффективность",
    "dependability": "Надёжность",
    "stimulation": "Стимуляция",
    "novelty": "Новизна",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _methodology(field: dict[str, Any]) -> str | None:
    config = field.get("config")
    tag = config.get("methodology") if isinstance(config, dict) else None
    return tag if isinstance(tag, str) else None


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", ".").strip())
        except ValueError:
            return None
    return None


def _round(value: float, digits: int = 1) -> float:
    return round(value + 0.0, digits)


def _config_number(field: dict[str, Any], key: str, default: float) -> float:
    config = field.get("config")
    value = _number(config.get(key)) if isinstance(config, dict) else None
    return default if value is None else value


def _option_index(field: dict[str, Any], value: Any) -> int | None:
    """Position of the chosen option (by id or by label), None when it cannot be resolved."""
    options = [o for o in field.get("options") or [] if isinstance(o, dict)]
    needle = str(value).strip().lower()
    for idx, opt in enumerate(options):
        if str(opt.get("id", "")).strip().lower() == needle:
            return idx
    for idx, opt in enumerate(options):
        if str(opt.get("label", "")).strip().lower() == needle:
            return idx
    return None


def _choice_labels(field: dict[str, Any], value: Any) -> list[str]:
    options = {
        str(o.get("id")): str(o.get("label", ""))
        for o in field.get("options") or []
        if isinstance(o, dict) and o.get("id") is not None
    }
    values = value if isinstance(value, list) else [value]
    labels: list[str] = []
    for v in values:
        if v is None:
            continue
        if isinstance(v, bool):
            labels.append("Да" if v else "Нет")
            continue
        text = str(v)
        labels.append("Другое" if text.startswith(OTHER_PREFIX) else options.get(text, text))
    return labels


# ─── Question statistics ──────────────────────────────────────────────────────


def _base_stat(field: dict[str, Any], kind: str, answered: int) -> QuestionStat:
    return QuestionStat(
        field_id=field["id"],
        label=str(field.get("label") or field["id"]),
        type=str(field.get("type")),
        methodology=_methodology(field),
        kind=kind,
        answered=answered,
    )


def _choice_stat(field: dict[str, Any], values: list[Any]) -> QuestionStat:
    counts: dict[str, int] = {
        str(o.get("label", "")): 0
        for o in field.get("options") or []
        if isinstance(o, dict) and o.get("label")
    }
    for value in values:
        for label in _choice_labels(field, value):
            counts[label] = counts.get(label, 0) + 1
    answered = len(values)
    stat = _base_stat(field, "choice", answered)
    stat.options = [
        QuestionOptionStat(
            label=label,
            count=count,
            percent=_round(count / answered * 100) if answered else 0.0,
        )
        for label, count in counts.items()
    ]
    return stat


def _scale_stat(field: dict[str, Any], values: list[Any]) -> QuestionStat:
    numbers = [n for n in (_number(v) for v in values) if n is not None]
    distribution: dict[float, int] = {}
    for n in numbers:
        distribution[n] = distribution.get(n, 0) + 1
    stat = _base_stat(field, "scale", len(numbers))
    stat.mean = _round(sum(numbers) / len(numbers), 2) if numbers else None
    stat.distribution = [ScaleBucket(value=v, count=c) for v, c in sorted(distribution.items())]
    return stat


def _text_stat(field: dict[str, Any], values: list[Any]) -> QuestionStat:
    texts = [v.strip() for v in values if isinstance(v, str) and v.strip()]
    stat = _base_stat(field, "text", len(values))
    stat.samples = texts[:MAX_TEXT_SAMPLES]
    return stat


def build_question_stats(
    fields: list[dict[str, Any]], answers_list: list[dict[str, Any]]
) -> list[QuestionStat]:
    stats: list[QuestionStat] = []
    for field in fields:
        values = [
            a[field["id"]]
            for a in answers_list
            if field["id"] in a and not is_empty(a[field["id"]])
        ]
        ftype = field.get("type")
        if ftype in CHOICE_TYPES:
            stats.append(_choice_stat(field, values))
        elif ftype in SCALE_TYPES:
            stats.append(_scale_stat(field, values))
        else:
            stats.append(_text_stat(field, values))
    return stats


# ─── Standardised metrics ─────────────────────────────────────────────────────


def _rating_fields(fields: list[dict[str, Any]], tag: str) -> list[dict[str, Any]]:
    return [f for f in fields if _methodology(f) == tag and f.get("type") == "rating"]


def _numbers_for(field: dict[str, Any], answers_list: list[dict[str, Any]]) -> list[float]:
    return [n for n in (_number(a.get(field["id"])) for a in answers_list) if n is not None]


def compute_nps(
    fields: list[dict[str, Any]], answers_list: list[dict[str, Any]]
) -> MetricResult | None:
    for field in _rating_fields(fields, "nps"):
        scores = _numbers_for(field, answers_list)
        if not scores:
            continue
        n = len(scores)
        promoters = sum(1 for s in scores if s >= 9)
        detractors = sum(1 for s in scores if s <= 6)
        passives = n - promoters - detractors
        value = (promoters - detractors) / n * 100
        return MetricResult(
            id="nps",
            name="NPS (индекс потребительской лояльности)",
            value=_round(value),
            unit="п.п. (от −100 до 100)",
            n=n,
            details={
                "Промоутеры (9–10), %": _round(promoters / n * 100),
                "Нейтралы (7–8), %": _round(passives / n * 100),
                "Критики (0–6), %": _round(detractors / n * 100),
            },
            interpretation=(
                "Промоутеров больше, чем критиков."
                if value > 0
                else "Критиков не меньше, чем промоутеров."
            ),
        )
    return None


def compute_csat(
    fields: list[dict[str, Any]], answers_list: list[dict[str, Any]]
) -> MetricResult | None:
    for field in _rating_fields(fields, "csat"):
        scores = _numbers_for(field, answers_list)
        if not scores:
            continue
        top = _config_number(field, "max", 5)
        satisfied = sum(1 for s in scores if s >= top - 1)
        return MetricResult(
            id="csat",
            name="CSAT (удовлетворённость)",
            value=_round(satisfied / len(scores) * 100),
            unit="% оценок 4–5",
            n=len(scores),
            details={"Средняя оценка": _round(sum(scores) / len(scores), 2)},
            interpretation="Доля респондентов, поставивших две верхние оценки шкалы.",
        )
    return None


def compute_ces(
    fields: list[dict[str, Any]], answers_list: list[dict[str, Any]]
) -> MetricResult | None:
    for field in _rating_fields(fields, "ces"):
        scores = _numbers_for(field, answers_list)
        if not scores:
            continue
        top = _config_number(field, "max", 7)
        easy = sum(1 for s in scores if s >= top - 2)
        return MetricResult(
            id="ces",
            name="CES (усилие клиента)",
            value=_round(sum(scores) / len(scores), 2),
            unit=f"средняя оценка из {int(top)}",
            n=len(scores),
            details={"Оценили 5–7 (легко), %": _round(easy / len(scores) * 100)},
            interpretation="Чем выше оценка, тем легче респондентам было решить свою задачу.",
        )
    return None


def _sus_grade(score: float) -> str:
    if score >= 80.3:
        return "Отлично (≥ 80): пользователи, скорее всего, порекомендуют систему."
    if score >= 68:
        return "Выше среднего (68–80): удобство лучше среднего по отрасли (68)."
    if score >= 51:
        return "Ниже среднего (51–68): есть проблемы с удобством."
    return "Плохо (< 51): серьёзные проблемы с удобством."


def compute_sus(
    fields: list[dict[str, Any]], answers_list: list[dict[str, Any]]
) -> MetricResult | None:
    items = [f for f in fields if _methodology(f) == "sus"]
    if len(items) != 10:
        return None
    scores: list[float] = []
    for answers in answers_list:
        total = 0
        complete = True
        for position, field in enumerate(items, start=1):
            value = answers.get(field["id"])
            idx = None if is_empty(value) else _option_index(field, value)
            if idx is None or idx > 4:
                complete = False
                break
            response = idx + 1  # 1..5
            total += (response - 1) if position % 2 == 1 else (5 - response)
        if complete:
            scores.append(total * 2.5)
    if not scores:
        return None
    mean = sum(scores) / len(scores)
    return MetricResult(
        id="sus",
        name="SUS (оценка удобства системы)",
        value=_round(mean),
        unit="баллов из 100",
        n=len(scores),
        details={},
        interpretation=_sus_grade(mean),
    )


def compute_ueq(
    fields: list[dict[str, Any]], answers_list: list[dict[str, Any]]
) -> MetricResult | None:
    items = [f for f in fields if _methodology(f) == "ueq"]
    if len(items) != len(UEQ_ITEMS):
        return None
    by_scale: dict[str, list[float]] = {}
    for field, (scale, right_positive) in zip(items, UEQ_ITEMS):
        for answers in answers_list:
            n = _number(answers.get(field["id"]))
            if n is None or not 1 <= n <= 7:
                continue
            score = n - 4 if right_positive else 4 - n  # -3 … +3, positive = better
            by_scale.setdefault(scale, []).append(score)
    if not by_scale:
        return None
    details = {
        UEQ_SCALE_NAMES[scale]: _round(sum(vals) / len(vals), 2)
        for scale, vals in by_scale.items()
    }
    all_scores = [s for vals in by_scale.values() for s in vals]
    respondents = sum(
        1 for a in answers_list if any(_number(a.get(f["id"])) is not None for f in items)
    )
    return MetricResult(
        id="ueq",
        name="UEQ (пользовательский опыт)",
        value=_round(sum(all_scores) / len(all_scores), 2),
        unit="средняя оценка от −3 до +3",
        n=respondents,
        details=details,
        interpretation=(
            "Значения выше 0,8 считаются положительной оценкой, ниже −0,8 — отрицательной; "
            "оценки по шкалам («Привлекательность», «Ясность» и т. д.) приведены в деталях."
        ),
    )


def compute_metrics(
    fields: list[dict[str, Any]], answers_list: list[dict[str, Any]]
) -> list[MetricResult]:
    computed = [
        compute_nps(fields, answers_list),
        compute_csat(fields, answers_list),
        compute_ces(fields, answers_list),
        compute_sus(fields, answers_list),
        compute_ueq(fields, answers_list),
    ]
    return [m for m in computed if m is not None]


# ─── Entry point ──────────────────────────────────────────────────────────────


def _median(values: list[int]) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return round((ordered[mid - 1] + ordered[mid]) / 2)


def build_results(pages: Any, responses: list[Any], *, exclude_flagged: bool = True) -> SurveyResults:
    usable = [r for r in responses if not (exclude_flagged and r.quality_flags)]
    answers_list = [r.answers for r in usable if isinstance(r.answers, dict)]
    fields = answerable_fields(pages)
    durations = [r.duration_seconds for r in usable if r.duration_seconds is not None]
    return SurveyResults(
        total=len(responses),
        used=len(usable),
        excluded=len(responses) - len(usable),
        exclude_flagged=exclude_flagged,
        median_duration_seconds=_median(durations),
        metrics=compute_metrics(fields, answers_list),
        questions=build_question_stats(fields, answers_list),
    )
