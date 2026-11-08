"""Answer-based jumps: shared cases (same file as the frontend check) and their effect on answers."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services import survey_answers, survey_logic, survey_results

CASES = json.loads(
    (Path(__file__).parent / "fixtures" / "survey_logic_cases.json").read_text(encoding="utf-8")
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_cases(case: dict) -> None:
    pages = case["pages"]
    path, ending = survey_logic.survey_path(pages, case["answers"])
    assert [pages[i]["id"] for i in path] == case["path"]
    assert (pages[ending]["id"] if ending is not None else None) == case["ending"]
    assert survey_logic.shown_field_ids(pages, case["answers"]) == set(case["shown"])


BRANCHED = [
    {
        "id": "p1",
        "fields": [
            {
                "id": "role",
                "type": "radio",
                "label": "Вы наш клиент?",
                "required": True,
                "options": [{"id": "a", "label": "Да"}, {"id": "b", "label": "Нет"}],
                "config": {"jumps": {"a": "p2", "b": "p3"}},
            }
        ],
    },
    {
        "id": "p2",
        "next": "end",
        "fields": [{"id": "client_q", "type": "longText", "label": "Что нравится?", "required": True}],
    },
    {
        "id": "p3",
        "fields": [{"id": "why", "type": "longText", "label": "Почему нет?", "required": True}],
    },
]


def test_required_only_on_the_path_and_other_branch_dropped() -> None:
    cleaned = survey_answers.validate_answers(
        BRANCHED, {"role": "Да", "client_q": "Скорость", "why": "осталось от другой ветки"}
    )
    assert cleaned == {"role": "Да", "client_q": "Скорость"}


def test_required_missing_on_the_chosen_branch() -> None:
    with pytest.raises(survey_answers.AnswersError) as exc:
        survey_answers.validate_answers(BRANCHED, {"role": "Нет"})
    assert exc.value.missing == ["Почему нет?"]


def test_too_fast_counts_only_shown_questions() -> None:
    # Two questions shown: the threshold is 5 s (minimum), not 3 × 1.5
    assert survey_answers.quality_flags(BRANCHED, {"role": "Да", "client_q": "x"}, 5) is None


class _Resp:
    def __init__(self, answers: dict) -> None:
        self.answers = answers
        self.quality_flags = None
        self.duration_seconds = 60
        self.submitted_at = None


def test_results_count_who_saw_the_question() -> None:
    responses = [
        _Resp({"role": "Да", "client_q": "Скорость"}),
        _Resp({"role": "Да", "client_q": "Цена"}),
        _Resp({"role": "Нет", "why": "Дорого"}),
    ]
    results = survey_results.build_results(BRANCHED, responses)
    by_id = {q.field_id: q for q in results.questions}
    assert (by_id["role"].shown, by_id["role"].answered) == (3, 3)
    assert (by_id["client_q"].shown, by_id["client_q"].answered) == (2, 2)
    assert (by_id["why"].shown, by_id["why"].answered) == (1, 1)
    # Each respondent answered everything they were shown
    assert results.completion_rate == 100.0
