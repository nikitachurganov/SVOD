from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from app.services import survey_quality as q
from app.services import survey_results

LIKERT = ["Полностью не согласен", "Скорее не согласен", "Ни то ни сё", "Скорее согласен", "Полностью согласен"]


def _likert(index: int) -> dict[str, Any]:
    return {
        "id": f"l{index}",
        "type": "radio",
        "label": f"Утверждение {index}",
        "options": [{"id": f"l{index}_o{j}", "label": label} for j, label in enumerate(LIKERT)],
    }


def _pages(likert_items: int, *, extra: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    fields = [_likert(i) for i in range(likert_items)] + (extra or [])
    return [{"id": "p1", "fields": fields}]


def _same(items: int, option: int = 3) -> dict[str, Any]:
    return {f"l{i}": f"l{i}_o{option}" for i in range(items)}


class StatusTests(unittest.TestCase):
    def test_status_by_strength_of_signals(self):
        self.assertEqual(q.status_of(None), "ok")
        self.assertEqual(q.status_of({}), "ok")
        self.assertEqual(q.status_of({"straight_lining": True}), "review")
        self.assertEqual(q.status_of({"too_fast": True}), "flagged")
        self.assertEqual(q.status_of({"too_fast": True, "straight_lining": True}), "flagged")
        # A flag of an older format behaves as it always did: strong
        self.assertEqual(q.status_of({"something_old": True}), "flagged")

    def test_only_strong_signals_leave_a_response_out_of_analytics(self):
        self.assertFalse(q.excludes_from_analysis({"straight_lining": True}))
        self.assertTrue(q.excludes_from_analysis({"failed_attention_check": True}))
        self.assertFalse(q.excludes_from_analysis(None))


class StraightLiningTests(unittest.TestCase):
    def test_same_answer_in_a_block_of_five_is_a_weak_signal(self):
        flags = q.detect_flags(_pages(6), _same(6), 120)
        self.assertEqual(flags, {"straight_lining": True})

    def test_varied_answers_or_a_short_block_are_not_flagged(self):
        varied = _same(6)
        varied["l2"] = "l2_o0"
        self.assertIsNone(q.detect_flags(_pages(6), varied, 120))
        self.assertIsNone(q.detect_flags(_pages(4), _same(4), 120))  # 4 items prove nothing

    def test_skipped_questions_do_not_count_and_yes_no_is_not_a_scale(self):
        answers = _same(6)
        answers.pop("l0")
        answers.pop("l1")  # only 4 answered left
        self.assertIsNone(q.detect_flags(_pages(6), answers, 120))
        yes_no = [
            {"id": f"y{i}", "type": "radio", "label": f"Да/нет {i}",
             "options": [{"id": f"y{i}a", "label": "Да"}, {"id": f"y{i}b", "label": "Нет"}]}
            for i in range(6)
        ]
        self.assertIsNone(q.detect_flags([{"id": "p", "fields": yes_no}], {f"y{i}": f"y{i}a" for i in range(6)}, 120))

    def test_attention_check_is_not_part_of_the_block(self):
        pages = _pages(5)
        pages[0]["fields"][0]["config"] = {"attentionCheck": True, "attentionCorrect": "Скорее согласен"}
        # four ordinary items answered alike + the control question: no block of five
        self.assertIsNone(q.detect_flags(pages, _same(5), 120))

    def test_detect_flags_keeps_the_strong_signals_next_to_the_weak_one(self):
        flags = q.detect_flags(_pages(6), _same(6), 2)
        self.assertEqual(flags, {"too_fast": True, "straight_lining": True})


class ExplainTests(unittest.TestCase):
    def test_reasons_are_explained_in_words_and_point_to_questions(self):
        reasons = q.explain(_pages(6), _same(6), 2, {"too_fast": True, "straight_lining": True})
        self.assertEqual([r.code for r in reasons], ["too_fast", "straight_lining"])  # strong first
        fast, lining = reasons
        self.assertEqual(fast.severity, "strong")
        self.assertIn("2 с", fast.explanation)
        self.assertIn("9 с", fast.explanation)  # 6 questions * 1.5 s
        self.assertEqual(lining.severity, "weak")
        self.assertEqual(lining.field_ids, [f"l{i}" for i in range(6)])
        self.assertIn("Скорее согласен", lining.explanation)
        self.assertIn("не исключает", lining.explanation)

    def test_failed_attention_check_names_the_question_and_the_expected_answer(self):
        control = {
            "id": "att",
            "type": "radio",
            "label": "Выберите «Скорее согласен»",
            "config": {"attentionCheck": True, "attentionCorrect": "Скорее согласен"},
            "options": [{"id": "a1", "label": "Полностью согласен"}, {"id": "a2", "label": "Скорее согласен"}],
        }
        pages = _pages(0, extra=[control])
        (reason,) = q.explain(pages, {"att": "a1"}, 60, {"failed_attention_check": True})
        self.assertEqual(reason.field_ids, ["att"])
        self.assertIn("Выберите «Скорее согласен»", reason.explanation)
        self.assertIn("Полностью согласен", reason.explanation)

    def test_unknown_flag_still_gets_an_explanation(self):
        (reason,) = q.explain(_pages(1), {}, None, {"legacy": True})
        self.assertEqual(reason.severity, "strong")
        self.assertTrue(reason.explanation)

    def test_no_flags_no_reasons(self):
        self.assertEqual(q.explain(_pages(1), {}, 60, None), [])


class AnalyticsExclusionTests(unittest.TestCase):
    def _response(self, flags):
        return SimpleNamespace(
            answers=_same(6),
            quality_flags=flags,
            duration_seconds=100,
            submitted_at=datetime.now(timezone.utc),
        )

    def test_weak_flag_keeps_the_response_in_the_figures_strong_one_removes_it(self):
        pages = _pages(6)
        responses = [
            self._response(None),
            self._response({"straight_lining": True}),
            self._response({"too_fast": True}),
        ]
        results = survey_results.build_results(pages, responses)
        self.assertEqual((results.total, results.used, results.excluded), (3, 2, 1))


class RatingObjectAnswerTests(unittest.TestCase):
    """The rating field stores its answer as {"value": 5, "min": 1, "max": 5}"""

    def test_rating_object_counts_as_a_number_in_the_results(self):
        self.assertEqual(survey_results._number({"value": 4, "min": 1, "max": 5}), 4.0)
        self.assertIsNone(survey_results._number({"min": 1, "max": 5}))
        self.assertIsNone(survey_results._number({"value": True}))

    def test_export_writes_the_score_not_the_object(self):
        from app.services import survey_answers

        self.assertEqual(survey_answers._format_value({"value": 5, "min": 1, "max": 5}, {}), "5")
        self.assertEqual(survey_answers._format_value({"other": 1}, {}), '{"other": 1}')


class PreviewTests(unittest.TestCase):
    PAGES = [
        {
            "id": "p",
            "fields": [
                {"id": "name", "type": "fullName", "label": "Имя"},
                {"id": "course", "type": "radio", "label": "Курс",
                 "options": [{"id": "c1", "label": "1 курс"}, {"id": "c2", "label": "2 курс"}]},
                {"id": "score", "type": "rating", "label": "Оценка"},
                {"id": "topics", "type": "checkbox", "label": "Разделы",
                 "options": [{"id": "t1", "label": "Заявки"}, {"id": "t2", "label": "Опросы"}]},
                {"id": "comment", "type": "longText", "label": "Что улучшить?"},
            ],
        }
    ]

    def test_quote_first_then_short_answers_with_labels(self):
        from app.services import survey_answers

        items = survey_answers.preview_items(
            self.PAGES,
            {
                "name": "Иван Петров",
                "course": "c2",
                "score": {"value": 4, "min": 1, "max": 5},
                "topics": ["t1", "t2"],
                "comment": "Хотелось бы быстрее",
            },
        )
        self.assertEqual(items[0], {"label": "Что улучшить?", "text": "Хотелось бы быстрее", "kind": "text"})
        self.assertEqual(
            [(i["label"], i["text"]) for i in items[1:]],
            [("Курс", "2 курс"), ("Оценка", "4 из 5"), ("Разделы", "Заявки; Опросы")],
        )

    def test_personal_fields_and_skipped_questions_are_left_out(self):
        from app.services import survey_answers

        items = survey_answers.preview_items(self.PAGES, {"name": "Иван Петров", "course": "c1"})
        self.assertEqual([i["label"] for i in items], ["Курс"])
        self.assertEqual(survey_answers.preview_items(self.PAGES, {}), [])

    def test_long_text_is_clipped(self):
        from app.services import survey_answers

        items = survey_answers.preview_items(self.PAGES, {"comment": "а" * 500}, max_text=50)
        self.assertEqual(len(items[0]["text"]), 50)
        self.assertTrue(items[0]["text"].endswith("…"))


if __name__ == "__main__":
    unittest.main()
