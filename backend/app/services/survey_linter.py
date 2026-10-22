"""Rule-based checks of question wording (Mom Test, double-barreled, leading questions)."""

from __future__ import annotations

import re
from typing import Any

MAX_RECOMMENDED_QUESTIONS = 40

_MOM_TEST = re.compile(
    r"\b(вы\s+бы|стали\s+бы|купили\s+бы|купите\s+ли|будете\s+ли|готовы\s+ли\s+вы\s+"
    r"(?:купить|платить|пользоваться)|сколько\s+бы\s+вы|как\s+вы\s+думаете,?\s+(?:понравил|"
    r"нужн|стоит)|понравил\w+\s+бы)\b",
    re.IGNORECASE,
)
_LEADING = re.compile(
    r"(не\s+так\s+ли|согласитесь|очевидно|безусловно|разве\s+не|не\s+правда\s+ли|"
    r"как\s+известно)",
    re.IGNORECASE,
)
_CLOSED_TYPES = {"rating", "radio", "yesNo", "dropdown"}
_DOUBLE_CONJ = re.compile(r"\s(?:и|а\s+также|и/или)\s", re.IGNORECASE)
_METHODS_WITH_FIXED_WORDING = {"sus", "ueq", "nps", "csat", "ces", "attention_check"}


def _iter_fields(pages: list[dict[str, Any]]):
    for page in pages:
        for field in page.get("fields") or []:
            if field.get("type") == "group":
                for child in field.get("children") or []:
                    yield child
            else:
                yield field


def lint_pages(pages: list[dict[str, Any]], methodology_ids: list[str]) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    questions = 0
    for field in _iter_fields(pages):
        questions += 1
        label = str(field.get("label") or "")
        config = field.get("config") if isinstance(field.get("config"), dict) else {}
        if config.get("methodology") in _METHODS_WITH_FIXED_WORDING:
            continue

        if "mom_test" in methodology_ids and _MOM_TEST.search(label):
            warnings.append(
                {
                    "rule": "mom_test",
                    "field": label,
                    "message": "Гипотетический вопрос. По Mom Test спрашивайте о реальном "
                    "прошлом опыте, а не о том, что человек «сделал бы».",
                }
            )
        if _LEADING.search(label):
            warnings.append(
                {
                    "rule": "leading",
                    "field": label,
                    "message": "Наводящая формулировка: она подталкивает к определённому ответу.",
                }
            )
        if (
            field.get("type") in _CLOSED_TYPES
            and "?" in label
            and len(label.split()) >= 6
            and _DOUBLE_CONJ.search(label)
        ):
            warnings.append(
                {
                    "rule": "double_barreled",
                    "field": label,
                    "message": "Возможно, вопрос двойной: в нём две мысли, а ответ один. "
                    "Разделите на два вопроса.",
                }
            )
    if questions > MAX_RECOMMENDED_QUESTIONS:
        warnings.append(
            {
                "rule": "length",
                "field": "",
                "message": f"В опросе {questions} вопросов. Длинные анкеты чаще бросают — "
                f"стремитесь к {MAX_RECOMMENDED_QUESTIONS} и меньше.",
            }
        )
    return warnings
