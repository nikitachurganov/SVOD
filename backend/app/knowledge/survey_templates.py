"""Fixed question blocks for standardised instruments.

Wording of NPS / CSAT / CES / SUS / UEQ is produced here, never by the model, so that the
instruments stay comparable between surveys. Russian wording of SUS and UEQ is a translation
of the original English items and must be checked against a validated Russian version before
publication of results.
"""

from __future__ import annotations

from typing import Any, Callable

AGREE_LABELS = [
    "Полностью не согласен",
    "Скорее не согласен",
    "Ни согласен, ни не согласен",
    "Скорее согласен",
    "Полностью согласен",
]

ATTENTION_CORRECT = "Скорее согласен"


def _scale(
    label: str,
    methodology: str,
    *,
    min_: int,
    max_: int,
    left: str = "",
    right: str = "",
    required: bool = True,
    description: str = "",
) -> dict[str, Any]:
    config: dict[str, Any] = {
        "ratingVariant": "numeric_scale",
        "min": min_,
        "max": max_,
        "step": 1,
        "methodology": methodology,
    }
    if left:
        config["leftLabel"] = left
    if right:
        config["rightLabel"] = right
    return {
        "type": "rating",
        "label": label,
        "placeholder": description or None,
        "required": required,
        "config": config,
    }


def _open(label: str, methodology: str, *, required: bool = False) -> dict[str, Any]:
    return {
        "type": "longText",
        "label": label,
        "placeholder": None,
        "required": required,
        "config": {"methodology": methodology},
    }


def nps(subject: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "rating",
            "label": f"С какой вероятностью вы порекомендуете {subject} другу или коллеге?",
            "placeholder": "0 — точно не порекомендую, 10 — точно порекомендую",
            "required": True,
            "config": {
                "ratingVariant": "nps",
                "min": 0,
                "max": 10,
                "step": 1,
                "methodology": "nps",
            },
        },
        _open("Почему вы поставили такую оценку?", "nps", required=True),
    ]


def csat(subject: str) -> list[dict[str, Any]]:
    return [
        _scale(
            f"Насколько вы удовлетворены {subject}?",
            "csat",
            min_=1,
            max_=5,
            left="Совсем не удовлетворён",
            right="Полностью удовлетворён",
        ),
        _open("Что повлияло на вашу оценку?", "csat"),
    ]


def ces(subject: str) -> list[dict[str, Any]]:
    return [
        _scale(
            "Насколько легко вам было решить свою задачу?",
            "ces",
            min_=1,
            max_=7,
            left="Очень сложно",
            right="Очень легко",
            description=subject and f"Речь о взаимодействии: {subject}",
        ),
        _open("Что можно было сделать проще?", "ces"),
    ]


SUS_ITEMS = [
    "Я думаю, что хотел бы часто пользоваться этой системой.",
    "Я нашёл эту систему излишне сложной.",
    "Я думаю, что эта система проста в использовании.",
    "Я думаю, что мне понадобится помощь технического специалиста, чтобы пользоваться этой системой.",
    "Я нашёл, что различные функции в этой системе хорошо интегрированы.",
    "Я думаю, что в этой системе слишком много несоответствий.",
    "Я думаю, что большинство людей очень быстро научатся пользоваться этой системой.",
    "Я нашёл эту систему очень громоздкой в использовании.",
    "Я чувствовал себя уверенно, пользуясь этой системой.",
    "Мне нужно было многому научиться, прежде чем я смог начать работать с этой системой.",
]


def sus(subject: str) -> list[dict[str, Any]]:
    group_label = "Оценка системы" if not subject else f"Оценка: {subject}"
    return [
        {
            "type": "group",
            "label": group_label,
            "placeholder": "Оцените, насколько вы согласны с каждым утверждением.",
            "required": False,
            "config": {"methodology": "sus"},
            "children": [
                {
                    "type": "radio",
                    "label": item,
                    "placeholder": None,
                    "required": True,
                    "options": [{"label": label} for label in AGREE_LABELS],
                    "config": {"methodology": "sus"},
                }
                for item in SUS_ITEMS
            ],
        }
    ]


UEQ_PAIRS = [
    ("Раздражающий", "Приятный"),
    ("Непонятный", "Понятный"),
    ("Творческий", "Безликий"),
    ("Легко осваивать", "Трудно осваивать"),
    ("Ценный", "Малоценный"),
    ("Скучный", "Захватывающий"),
    ("Неинтересный", "Интересный"),
    ("Непредсказуемый", "Предсказуемый"),
    ("Быстрый", "Медленный"),
    ("Оригинальный", "Шаблонный"),
    ("Мешающий", "Помогающий"),
    ("Хороший", "Плохой"),
    ("Сложный", "Простой"),
    ("Отталкивающий", "Привлекательный"),
    ("Обычный", "Передовой"),
    ("Неприятный", "Приятный в работе"),
    ("Надёжный", "Ненадёжный"),
    ("Мотивирующий", "Демотивирующий"),
    ("Соответствует ожиданиям", "Не соответствует ожиданиям"),
    ("Неэффективный", "Эффективный"),
    ("Ясный", "Запутанный"),
    ("Непрактичный", "Практичный"),
    ("Организованный", "Хаотичный"),
    ("Привлекательный", "Непривлекательный"),
    ("Дружелюбный", "Недружелюбный"),
    ("Консервативный", "Инновационный"),
]


def ueq(subject: str) -> list[dict[str, Any]]:
    target = subject or "продукт"
    return [
        {
            "type": "group",
            "label": "Впечатления от продукта",
            "placeholder": f"Оцените {target}: выберите точку между двумя противоположными "
            "прилагательными, ближе к тому, которое точнее описывает ваше впечатление.",
            "required": False,
            "config": {"methodology": "ueq"},
            "children": [
                _scale(f"{left} — {right}", "ueq", min_=1, max_=7, left=left, right=right)
                for left, right in UEQ_PAIRS
            ],
        }
    ]


def attention_check(subject: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "radio",
            "label": (
                "Чтобы мы знали, что вы внимательно читаете вопросы, "
                f"выберите вариант «{ATTENTION_CORRECT}»."
            ),
            "placeholder": None,
            "required": True,
            "options": [{"label": label} for label in AGREE_LABELS],
            "config": {
                "methodology": "attention_check",
                "attentionCheck": True,
                "attentionCorrect": ATTENTION_CORRECT,
            },
        }
    ]


TEMPLATES: dict[str, Callable[[str], list[dict[str, Any]]]] = {
    "nps": nps,
    "csat": csat,
    "ces": ces,
    "sus": sus,
    "ueq": ueq,
    "attention_check": attention_check,
}

# Where a template block goes: "end" — appended to the last page, "own_page" — on its own page,
# "middle" — inserted in the middle of the longest page
TEMPLATE_PLACEMENT: dict[str, str] = {
    "nps": "end",
    "csat": "end",
    "ces": "end",
    "sus": "own_page",
    "ueq": "own_page",
    "attention_check": "middle",
}

TEMPLATE_PAGE_TITLES: dict[str, str] = {
    "sus": "Оценка юзабилити (SUS)",
    "ueq": "Пользовательский опыт (UEQ)",
}
