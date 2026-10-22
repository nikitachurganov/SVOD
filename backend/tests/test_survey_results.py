from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from app.knowledge import survey_templates as tpl
from app.services import survey_answers, survey_results


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


class DescriptiveAndSummaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pages = [
            {
                "id": "p1",
                "fields": [
                    {"id": "q_num", "type": "number", "label": "Оценка"},
                    {"id": "q_text", "type": "longText", "label": "Комментарий"},
                ],
            }
        ]

    def test_descriptive_statistics(self):
        responses = [_resp({"q_num": v}) for v in (2, 4, 4, 4, 5, 5, 7, 9)]
        stat = survey_results.build_results(self.pages, responses).questions[0]
        self.assertEqual(stat.mean, 5.0)
        self.assertEqual(stat.median, 4.5)
        self.assertEqual(stat.mode, 4.0)
        self.assertAlmostEqual(stat.std, 2.14, places=2)  # sample std (n - 1)

    def test_std_is_none_for_single_answer(self):
        stat = survey_results.build_results(self.pages, [_resp({"q_num": 3})]).questions[0]
        self.assertIsNone(stat.std)

    def test_summary_fields(self):
        responses = [
            _resp({"q_num": 1, "q_text": "a"}, duration=40),
            _resp({"q_num": 2}, duration=80),
        ]
        results = survey_results.build_results(self.pages, responses)
        self.assertEqual(results.mean_duration_seconds, 60)
        self.assertEqual(results.completion_rate, 75.0)  # (2/2 + 1/2) / 2
        self.assertIsNotNone(results.first_response_at)
        self.assertIsNotNone(results.last_response_at)

    def test_summary_fields_empty(self):
        results = survey_results.build_results(self.pages, [])
        self.assertIsNone(results.completion_rate)
        self.assertIsNone(results.mean_duration_seconds)
        self.assertIsNone(results.last_response_at)


class CrosstabTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pages = [
            {
                "id": "p1",
                "fields": [
                    {
                        "id": "course",
                        "type": "radio",
                        "label": "Курс",
                        "options": [{"id": "c1", "label": "1 курс"}, {"id": "c3", "label": "3 курс"}],
                    },
                    {
                        "id": "sex",
                        "type": "radio",
                        "label": "Пол",
                        "options": [{"id": "m", "label": "М"}, {"id": "f", "label": "Ж"}],
                    },
                    {"id": "score", "type": "number", "label": "Оценка"},
                    {"id": "src", "type": "checkbox", "label": "Источник",
                     "options": [{"id": "s1", "label": "Сайт"}, {"id": "s2", "label": "Друзья"}]},
                    {"id": "text", "type": "longText", "label": "Комментарий"},
                ],
            }
        ]

    def _responses(self, cells: dict[tuple[str, str], int]):
        out = []
        for (course, sex), n in cells.items():
            out += [_resp({"course": course, "sex": sex, "score": 5 if course == "c1" else 3})] * n
        return out

    def test_chi_square_on_known_table(self):
        # [[20, 30], [30, 20]] -> chi2 = 4.0, df = 1, p ≈ 0.0455, V = 0.2
        responses = self._responses(
            {("c1", "m"): 20, ("c1", "f"): 30, ("c3", "m"): 30, ("c3", "f"): 20}
        )
        result = survey_results.build_crosstab(self.pages, responses, "course", "sex")
        self.assertEqual(result.kind, "table")
        self.assertEqual(result.row_labels, ["1 курс", "3 курс"])
        self.assertEqual(result.counts, [[20, 30], [30, 20]])
        self.assertEqual(result.row_percent, [[40.0, 60.0], [60.0, 40.0]])
        self.assertEqual(result.n, 100)
        self.assertEqual(result.chi2, 4.0)
        self.assertEqual(result.dof, 1)
        self.assertAlmostEqual(result.p_value, 0.0455, places=4)
        self.assertEqual(result.cramers_v, 0.2)
        self.assertIsNone(result.note)

    def test_small_samples_get_a_warning(self):
        responses = self._responses(
            {("c1", "m"): 2, ("c1", "f"): 1, ("c3", "m"): 1, ("c3", "f"): 3}
        )
        result = survey_results.build_crosstab(self.pages, responses, "course", "sex")
        self.assertIn("ненадёжен", result.note or "")

    def test_numeric_by_group_returns_means(self):
        responses = self._responses({("c1", "m"): 2, ("c3", "m"): 2})
        # numeric question may be passed as either axis
        result = survey_results.build_crosstab(self.pages, responses, "course", "score")
        self.assertEqual(result.kind, "means")
        self.assertEqual(result.row_field_id, "score")
        self.assertEqual(result.col_field_id, "course")
        groups = {g.label: g for g in result.groups}
        self.assertEqual(groups["1 курс"].mean, 5.0)
        self.assertEqual(groups["3 курс"].mean, 3.0)
        self.assertEqual(groups["1 курс"].n, 2)

    def test_multi_select_skips_chi_square(self):
        responses = [
            _resp({"course": "c1", "src": ["s1", "s2"]}),
            _resp({"course": "c3", "src": ["s1"]}),
        ]
        result = survey_results.build_crosstab(self.pages, responses, "course", "src")
        self.assertIsNone(result.chi2)
        self.assertEqual(result.counts, [[1, 1], [1, 0]])
        self.assertIn("Множественный выбор", result.note or "")

    def test_flagged_responses_are_skipped(self):
        responses = self._responses({("c1", "m"): 1, ("c3", "f"): 1})
        responses.append(_resp({"course": "c1", "sex": "f"}, flags={"too_fast": True}))
        result = survey_results.build_crosstab(self.pages, responses, "course", "sex")
        self.assertEqual(result.n, 2)

    def test_errors(self):
        with self.assertRaises(survey_results.CrosstabError) as ctx:
            survey_results.build_crosstab(self.pages, [], "course", "missing")
        self.assertEqual(ctx.exception.code, "question_not_found")
        with self.assertRaises(survey_results.CrosstabError) as ctx:
            survey_results.build_crosstab(self.pages, [], "course", "text")
        self.assertEqual(ctx.exception.code, "unsupported_question_type")


class DurationRuleTests(unittest.TestCase):
    def test_unknown_zero_and_absurd_durations_are_left_out(self):
        pages = _pages([{"id": "q", "type": "number", "label": "Q"}])
        durations = [30, 90, None, 0, 99_999]  # the last one: a tab left open for a day
        responses = [_resp({"q": 1}, duration=d) for d in durations]
        results = survey_results.build_results(pages, responses)
        self.assertEqual(results.mean_duration_seconds, 60)
        self.assertEqual(results.median_duration_seconds, 60)

    def test_no_valid_durations_means_no_figure(self):
        pages = _pages([{"id": "q", "type": "number", "label": "Q"}])
        results = survey_results.build_results(pages, [_resp({"q": 1}, duration=None)])
        self.assertIsNone(results.mean_duration_seconds)
        self.assertIsNone(results.median_duration_seconds)


class CsvExportTests(unittest.TestCase):
    PAGES = [
        {
            "id": "p1",
            "fields": [
                {
                    "id": "course",
                    "type": "radio",
                    "label": "Курс, на котором учитесь",
                    "options": [{"id": "c1", "label": "1 курс"}, {"id": "c3", "label": "3 курс"}],
                },
                {
                    "id": "src",
                    "type": "checkbox",
                    "label": "Источники",
                    "options": [{"id": "s1", "label": "Сайт"}, {"id": "s2", "label": "Друзья"}],
                },
                {"id": "note", "type": "longText", "label": 'Комментарий "как есть"'},
            ],
        }
    ]

    def _rows(self, responses):
        import csv
        import io

        text = survey_answers.build_csv(self.PAGES, responses)
        return list(csv.reader(io.StringIO(text, newline=""), delimiter=";"))

    def test_header_uses_question_labels_and_values_are_readable(self):
        rows = self._rows([_resp({"course": "c3", "src": ["s1", "s2"], "note": "ок"}, duration=75)])
        self.assertEqual(
            rows[0],
            ["Дата и время (UTC)", "Длительность, с", "Флаги качества", "Курс, на котором учитесь", "Источники", 'Комментарий "как есть"'],
        )
        self.assertEqual(rows[1][1], "75")
        self.assertEqual(rows[1][3:], ["3 курс", "Сайт; Друзья", "ок"])

    def test_commas_quotes_semicolons_and_line_breaks_survive_a_round_trip(self):
        nasty = 'Строка 1, с запятой; и точкой с запятой\nСтрока 2 с "кавычками"'
        rows = self._rows([_resp({"note": nasty})])
        self.assertEqual(len(rows), 2)  # the line break stayed inside one cell
        self.assertEqual(rows[1][5], nasty)

    def test_formula_like_text_is_neutralised(self):
        rows = self._rows([_resp({"note": "=HYPERLINK(\"http://evil\")"})])
        self.assertTrue(rows[1][5].startswith("'="))

    def test_flags_and_skipped_answers(self):
        rows = self._rows([_resp({"course": "c1"}, flags={"too_fast": True}, duration=2)])
        self.assertEqual(rows[1][2], "too_fast")
        self.assertEqual(rows[1][4:], ["", ""])


class ResponsesByDayTests(unittest.TestCase):
    def test_counts_per_utc_day_oldest_first(self):
        pages = _pages([{"id": "q", "type": "number", "label": "Q"}])
        first = datetime(2026, 10, 20, 23, 59, tzinfo=timezone.utc)
        responses = [
            SimpleNamespace(answers={"q": 1}, quality_flags=None, duration_seconds=30, submitted_at=when)
            for when in (
                datetime(2026, 10, 22, 9, 0, tzinfo=timezone.utc),
                first,
                datetime(2026, 10, 22, 18, 0, tzinfo=timezone.utc),
            )
        ]
        days = survey_results.build_results(pages, responses).responses_by_day
        self.assertEqual([(d.date, d.count) for d in days], [("2026-10-20", 1), ("2026-10-22", 2)])


_FORM = [
    {
        "id": "p1",
        "fields": [
            {
                "id": "course",
                "type": "radio",
                "label": "Курс",
                "options": [{"id": "c1", "label": "1 курс"}, {"id": "c3", "label": "3 курс"}],
            },
            {"id": "score", "type": "number", "label": "Оценка", "config": {"methodology": "csat"}},
            {"id": "note", "type": "longText", "label": "Комментарий"},
        ],
    }
]


class QuestionDefsAndStructureTests(unittest.TestCase):
    def test_question_defs_keep_form_order_options_and_methodology(self):
        defs = survey_answers.question_defs(_FORM)
        self.assertEqual([d["id"] for d in defs], ["course", "score", "note"])
        self.assertEqual(defs[0]["options"], [{"id": "c1", "label": "1 курс"}, {"id": "c3", "label": "3 курс"}])
        self.assertEqual(defs[1]["methodology"], "csat")
        self.assertIsNone(defs[2]["methodology"])

    def test_safe_edits_are_allowed(self):
        edited = [
            {
                "id": "p1",
                "fields": [
                    {
                        "id": "course",
                        "type": "radio",
                        "label": "На каком вы курсе?",  # reworded
                        "options": [
                            {"id": "c1", "label": "Первый"},  # relabelled
                            {"id": "c3", "label": "3 курс"},
                            {"id": "c5", "label": "5 курс"},  # added
                        ],
                    },
                    {"id": "score", "type": "number", "label": "Оценка"},
                    {"id": "note", "type": "longText", "label": "Комментарий"},
                    {"id": "extra", "type": "shortText", "label": "Новый вопрос"},  # added
                ],
            }
        ]
        self.assertEqual(survey_answers.structure_conflicts(_FORM, edited), [])

    def test_removed_retyped_and_option_removals_are_reported(self):
        edited = [
            {
                "id": "p1",
                "fields": [
                    {
                        "id": "course",
                        "type": "radio",
                        "label": "Курс",
                        "options": [{"id": "c1", "label": "1 курс"}],  # c3 removed
                    },
                    {"id": "score", "type": "shortText", "label": "Оценка"},  # retyped
                ],  # note removed
            }
        ]
        problems = survey_answers.structure_conflicts(_FORM, edited)
        self.assertEqual(len(problems), 3)
        self.assertTrue(any("«Курс»" in p and "3 курс" in p for p in problems))
        self.assertTrue(any("«Оценка»" in p and "тип" in p for p in problems))
        self.assertTrue(any("«Комментарий»" in p and "удалён" in p for p in problems))


if __name__ == "__main__":
    unittest.main()
