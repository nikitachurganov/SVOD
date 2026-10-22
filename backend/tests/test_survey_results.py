from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from app.knowledge import survey_templates as tpl
from app.services import survey_results


def _with_ids(fields: list[dict[str, Any]], prefix: str) -> list[dict[str, Any]]:
    """Assign ids (fields and options) the way the builder does."""
    out: list[dict[str, Any]] = []
    for i, field in enumerate(fields):
        field = dict(field)
        field["id"] = f"{prefix}{i}"
        if field.get("options"):
            field["options"] = [
                {**opt, "id": f"{field['id']}_o{j}"} for j, opt in enumerate(field["options"])
            ]
        if field.get("children"):
            field["children"] = _with_ids(field["children"], f"{field['id']}_")
        out.append(field)
    return out


def _resp(answers: dict[str, Any], flags: dict[str, Any] | None = None, duration: int | None = 60):
    return SimpleNamespace(
        answers=answers,
        quality_flags=flags,
        duration_seconds=duration,
        submitted_at=datetime.now(timezone.utc),
    )


def _pages(*blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for block in blocks:
        fields.extend(block)
    return [{"id": "p1", "title": "Страница", "fields": fields}]


class NpsCsatCesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pages = _pages(
            _with_ids(tpl.nps("сервис"), "nps"),
            _with_ids(tpl.csat("сервисом"), "csat"),
            _with_ids(tpl.ces("сервис"), "ces"),
        )

    def test_nps_counts_promoters_and_detractors(self):
        # 2 promoters (9, 10), 1 passive (8), 1 detractor (3) -> (2-1)/4 = 25
        scores = [9, 10, 8, 3]
        responses = [_resp({"nps0": s, "csat0": 5, "ces0": 6}) for s in scores]
        results = survey_results.build_results(self.pages, responses)
        nps = next(m for m in results.metrics if m.id == "nps")
        self.assertEqual(nps.value, 25.0)
        self.assertEqual(nps.n, 4)
        self.assertEqual(nps.details["Промоутеры (9–10), %"], 50.0)

    def test_csat_is_share_of_top_two(self):
        responses = [_resp({"csat0": s}) for s in (5, 4, 3, 1)]
        results = survey_results.build_results(self.pages, responses)
        csat = next(m for m in results.metrics if m.id == "csat")
        self.assertEqual(csat.value, 50.0)
        self.assertEqual(csat.details["Средняя оценка"], 3.25)

    def test_ces_is_mean(self):
        responses = [_resp({"ces0": s}) for s in (7, 5, 3)]
        results = survey_results.build_results(self.pages, responses)
        ces = next(m for m in results.metrics if m.id == "ces")
        self.assertEqual(ces.value, 5.0)

    def test_no_answers_means_no_metrics(self):
        results = survey_results.build_results(self.pages, [])
        self.assertEqual(results.metrics, [])
        self.assertEqual(results.total, 0)


class SusTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pages = _pages(_with_ids(tpl.sus("система"), "sus"))
        self.items = self.pages[0]["fields"][0]["children"]

    def _answers(self, picks: list[int]) -> dict[str, Any]:
        # picks are 1..5; stored the way the public form stores radios — by label
        return {
            item["id"]: item["options"][pick - 1]["label"]
            for item, pick in zip(self.items, picks)
        }

    def test_best_possible_score_is_100(self):
        picks = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]
        results = survey_results.build_results(self.pages, [_resp(self._answers(picks))])
        sus = next(m for m in results.metrics if m.id == "sus")
        self.assertEqual(sus.value, 100.0)

    def test_worst_possible_score_is_0(self):
        picks = [1, 5, 1, 5, 1, 5, 1, 5, 1, 5]
        results = survey_results.build_results(self.pages, [_resp(self._answers(picks))])
        sus = next(m for m in results.metrics if m.id == "sus")
        self.assertEqual(sus.value, 0.0)

    def test_neutral_answers_give_50_and_ids_are_supported(self):
        answers = {item["id"]: item["options"][2]["id"] for item in self.items}
        results = survey_results.build_results(self.pages, [_resp(answers)])
        sus = next(m for m in results.metrics if m.id == "sus")
        self.assertEqual(sus.value, 50.0)

    def test_incomplete_respondent_is_skipped(self):
        answers = self._answers([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])
        answers.pop(self.items[0]["id"])
        results = survey_results.build_results(self.pages, [_resp(answers)])
        self.assertFalse(any(m.id == "sus" for m in results.metrics))


class UeqTests(unittest.TestCase):
    def test_polarity_per_item(self):
        pages = _pages(_with_ids(tpl.ueq("продукт"), "ueq"))
        items = pages[0]["fields"][0]["children"]
        # Always pick the right-hand pole (7): positive only where the right pole is positive
        answers = {item["id"]: 7 for item in items}
        results = survey_results.build_results(pages, [_resp(answers)])
        ueq = next(m for m in results.metrics if m.id == "ueq")
        right_positive = sum(1 for _, rp in survey_results.UEQ_ITEMS if rp)
        expected = (3 * right_positive - 3 * (26 - right_positive)) / 26
        self.assertAlmostEqual(ueq.value, round(expected, 2), places=2)
        self.assertEqual(set(ueq.details), set(survey_results.UEQ_SCALE_NAMES.values()))

    def test_item_table_matches_template(self):
        self.assertEqual(len(survey_results.UEQ_ITEMS), len(tpl.UEQ_PAIRS))


class QuestionStatsAndQualityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pages = [
            {
                "id": "p1",
                "fields": [
                    {
                        "id": "q_choice",
                        "type": "radio",
                        "label": "Курс",
                        "options": [{"id": "a", "label": "1 курс"}, {"id": "b", "label": "2 курс"}],
                    },
                    {
                        "id": "q_multi",
                        "type": "checkbox",
                        "label": "Источники",
                        "options": [{"id": "x", "label": "Сайт"}, {"id": "y", "label": "Друзья"}],
                    },
                    {"id": "q_text", "type": "longText", "label": "Комментарий"},
                    {"id": "q_num", "type": "number", "label": "Возраст"},
                ],
            }
        ]

    def test_choice_scale_and_text(self):
        responses = [
            _resp({"q_choice": "1 курс", "q_multi": ["Сайт", "Друзья"], "q_text": "ок", "q_num": 20}),
            _resp({"q_choice": "b", "q_multi": ["Сайт"], "q_num": "22"}),
            _resp({"q_choice": "__other__:магистратура"}),
        ]
        stats = {q.field_id: q for q in survey_results.build_results(self.pages, responses).questions}
        choice = {o.label: o for o in stats["q_choice"].options}
        self.assertEqual(choice["1 курс"].count, 1)
        self.assertEqual(choice["2 курс"].count, 1)  # stored by option id
        self.assertEqual(choice["Другое"].count, 1)
        self.assertAlmostEqual(choice["1 курс"].percent, 33.3, places=1)
        multi = {o.label: o.count for o in stats["q_multi"].options}
        self.assertEqual(multi, {"Сайт": 2, "Друзья": 1})
        self.assertEqual(stats["q_text"].samples, ["ок"])
        self.assertEqual(stats["q_num"].mean, 21.0)

    def test_flagged_responses_are_excluded_by_default(self):
        responses = [
            _resp({"q_num": 10}),
            _resp({"q_num": 30}, flags={"too_fast": True}, duration=2),
        ]
        results = survey_results.build_results(self.pages, responses)
        self.assertEqual((results.total, results.used, results.excluded), (2, 1, 1))
        self.assertEqual(results.questions[3].mean, 10.0)
        all_results = survey_results.build_results(self.pages, responses, exclude_flagged=False)
        self.assertEqual(all_results.used, 2)
        self.assertEqual(all_results.questions[3].mean, 20.0)
        self.assertEqual(all_results.median_duration_seconds, 31)


if __name__ == "__main__":
    unittest.main()
