from __future__ import annotations

import json
import unittest
from unittest.mock import AsyncMock, patch

from app.knowledge import survey_templates
from app.knowledge.methodologies import METHODOLOGIES
from app.knowledge.sources import SOURCES
from app.schemas.survey import SurveyAiBuildRequest
from app.services import (
    survey_ai_builder_service as builder,
    survey_answers,
    survey_linter,
    survey_methodology_service,
)


def _request(text="Анкета для курсовой по лояльности студентов", **kwargs):
    return SurveyAiBuildRequest(messages=[{"role": "user", "content": text}], **kwargs)


def _select(**overrides):
    data = {
        "category": "academic_survey",
        "goals": ["Оценить лояльность студентов"],
        "methodologies": ["likert", "nps"],
        "subject": "вуза",
    }
    data.update(overrides)
    return json.dumps(data, ensure_ascii=False)


def _generation(pages="default"):
    if pages == "default":
        pages = [
            {
                "title": "Основное",
                "fields": [
                    {
                        "type": "radio",
                        "label": "Расписание мне удобно",
                        "required": True,
                        "options": ["Полностью не согласен", "Полностью согласен"],
                        "methodology": "likert",
                    },
                    {"type": "longText", "label": "Что улучшить?", "methodology": "unknown_id"},
                ],
            }
        ]
    return json.dumps({"reply": "Готово", "title": "Лояльность", "pages": pages}, ensure_ascii=False)


def _flatten(pages):
    return list(survey_methodology_service.iter_leaf_fields(pages))


class CatalogueTests(unittest.TestCase):
    def test_catalogue_references_are_consistent(self):
        for method in METHODOLOGIES.values():
            for key in method.sources:
                self.assertIn(key, SOURCES, f"{method.id}: unknown source {key}")
            if method.template:
                self.assertIn(method.template, survey_templates.TEMPLATES)

    def test_standardised_blocks(self):
        self.assertEqual(len(survey_templates.SUS_ITEMS), 10)
        self.assertEqual(len(survey_templates.UEQ_PAIRS), 26)
        nps = survey_templates.nps("вуза")
        self.assertEqual(nps[0]["config"]["ratingVariant"], "nps")
        self.assertTrue(nps[1]["required"])
        check = survey_templates.attention_check("")[0]
        self.assertTrue(check["config"]["attentionCheck"])
        self.assertIn(survey_templates.ATTENTION_CORRECT, [o["label"] for o in check["options"]])


class LinterTests(unittest.TestCase):
    def _pages(self, *labels, type_="shortText"):
        return [{"fields": [{"type": type_, "label": label} for label in labels]}]

    def test_mom_test_flags_hypothetical_questions(self):
        pages = self._pages("Вы бы купили такой сервис?", "Расскажите о последнем заказе")
        rules = [w["rule"] for w in survey_linter.lint_pages(pages, ["mom_test"])]
        self.assertEqual(rules, ["mom_test"])
        self.assertEqual(survey_linter.lint_pages(pages, ["jtbd"]), [])

    def test_double_barreled_and_leading(self):
        pages = self._pages(
            "Насколько вам удобно и быстро работает сайт при оформлении заказа?", type_="rating"
        )
        pages += self._pages("Согласитесь, что сервис хороший?")
        rules = {w["rule"] for w in survey_linter.lint_pages(pages, [])}
        self.assertEqual(rules, {"double_barreled", "leading"})

    def test_fixed_wording_blocks_are_not_linted(self):
        pages = [
            {
                "fields": [
                    {
                        "type": "rating",
                        "label": "Согласитесь, что и это, и то тоже хорошо?",
                        "config": {"methodology": "sus"},
                    }
                ]
            }
        ]
        self.assertEqual(survey_linter.lint_pages(pages, ["sus"]), [])


class AnswersTests(unittest.TestCase):
    PAGES = [
        {
            "fields": [
                {"id": "a", "type": "shortText", "label": "Имя", "required": True},
                {"id": "b", "type": "number", "label": "Возраст", "required": False},
                {
                    "id": "g",
                    "type": "group",
                    "label": "Группа",
                    "children": [
                        {
                            "id": "att",
                            "type": "radio",
                            "label": "Выберите «Скорее согласен»",
                            "required": True,
                            "options": [
                                {"id": "o1", "label": "Скорее не согласен"},
                                {"id": "o2", "label": "Скорее согласен"},
                            ],
                            "config": {
                                "attentionCheck": True,
                                "attentionCorrect": "Скорее согласен",
                            },
                        }
                    ],
                },
            ]
        }
    ]

    def test_required_and_unknown_ids(self):
        with self.assertRaises(survey_answers.AnswersError) as ctx:
            survey_answers.validate_answers(self.PAGES, {"b": 0})
        self.assertEqual(ctx.exception.missing, ["Имя", "Выберите «Скорее согласен»"])
        cleaned = survey_answers.validate_answers(
            self.PAGES, {"a": "Аня", "b": 0, "att": "o2", "evil": "x"}
        )
        self.assertEqual(cleaned, {"a": "Аня", "b": 0, "att": "o2"})

    def test_attention_check_flags(self):
        ok = survey_answers.quality_flags(self.PAGES, {"a": "x", "att": "o2"}, 60)
        self.assertIsNone(ok)
        by_label = survey_answers.quality_flags(self.PAGES, {"a": "x", "att": "Скорее согласен"}, 60)
        self.assertIsNone(by_label)
        bad = survey_answers.quality_flags(self.PAGES, {"a": "x", "att": "o1"}, 60)
        self.assertEqual(bad, {"failed_attention_check": True})
        fast = survey_answers.quality_flags(self.PAGES, {"a": "x", "att": "o2"}, 2)
        self.assertEqual(fast, {"too_fast": True})

    def test_public_pages_hide_correct_answer(self):
        cleaned = survey_answers.strip_private_config(self.PAGES)
        config = cleaned[0]["fields"][2]["children"][0]["config"]
        self.assertNotIn("attentionCorrect", config)
        self.assertTrue(config["attentionCheck"])
        self.assertIn("attentionCorrect", self.PAGES[0]["fields"][2]["children"][0]["config"])

    def test_csv_export_escapes_formulas_and_maps_options(self):
        from types import SimpleNamespace
        from datetime import datetime, timezone

        response = SimpleNamespace(
            submitted_at=datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc),
            duration_seconds=42,
            quality_flags={"failed_attention_check": True},
            answers={"a": "=cmd()", "att": "o1"},
        )
        text = survey_answers.build_csv(self.PAGES, [response])
        header, row = text.strip().split("\r\n")
        self.assertIn("Имя", header)
        self.assertIn("'=cmd()", row)
        self.assertIn("Скорее не согласен", row)
        self.assertIn("failed_attention_check", row)


class SummaryAndReportTests(unittest.TestCase):
    META = {
        "category": "academic_survey",
        "goals": ["Оценить лояльность"],
        "methodologies": ["likert", "attention_check"],
    }
    PAGES = [
        {
            "fields": [
                {"type": "radio", "label": "q1", "config": {"methodology": "likert"}},
                {"type": "radio", "label": "q2", "config": {"methodology": "likert"}},
                {"type": "longText", "label": "q3"},
            ]
        }
    ]

    def test_summary_counts_questions_per_methodology(self):
        summary = survey_methodology_service.build_summary(self.META, self.PAGES)
        self.assertEqual([m.id for m in summary.methodologies], ["likert", "attention_check"])
        self.assertEqual(summary.methodologies[0].questions_count, 2)
        self.assertIn("ГОСТ", summary.standards_note)

    def test_summary_is_none_without_methodologies(self):
        self.assertIsNone(survey_methodology_service.build_summary(None, self.PAGES))
        self.assertIsNone(survey_methodology_service.build_summary({"methodologies": ["x"]}, []))

    def test_report_contains_sections_and_bibliography(self):
        report = survey_methodology_service.build_report("Опрос", self.META, self.PAGES)
        self.assertIn("Шкала Лайкерта", report.markdown)
        self.assertIn("## Список литературы", report.markdown)
        self.assertTrue(any("Likert" in item for item in report.bibliography))
        self.assertTrue(report.has_unverified_sources)


class AiBuilderTests(unittest.IsolatedAsyncioTestCase):
    async def test_full_pipeline_selects_generates_and_inserts_templates(self):
        llm = AsyncMock(side_effect=[_select(), _generation()])
        with patch.object(builder, "post_chat_completion", llm):
            result = await builder.build_survey(_request())

        self.assertEqual(llm.await_count, 2)
        self.assertEqual(result.methodology_meta["category"], "academic_survey")
        self.assertEqual(result.methodology_meta["methodologies"], ["likert", "nps", "attention_check"])
        fields = _flatten(result.pages)
        tags = [f.get("config", {}).get("methodology") for f in fields]
        # model-written Likert question keeps its tag, unknown tag is dropped
        self.assertEqual(tags[0], "likert")
        self.assertIsNone(tags[1])
        # templates: NPS (+ open follow-up) and attention check
        self.assertEqual(tags.count("nps"), 2)
        self.assertEqual(tags.count("attention_check"), 1)
        nps = next(f for f in fields if f.get("config", {}).get("ratingVariant") == "nps")
        self.assertIn("вуза", nps["label"])
        counts = {m.id: m.questions_count for m in result.methodology_summary.methodologies}
        self.assertEqual(counts["likert"], 1)
        self.assertEqual(counts["nps"], 2)

    async def test_selection_ignores_unknown_methodologies(self):
        llm = AsyncMock(
            side_effect=[_select(category="nope", methodologies=["bogus", "mom_test"]), _generation()]
        )
        with patch.object(builder, "post_chat_completion", llm):
            result = await builder.build_survey(_request("Проверить идею доставки"))
        self.assertEqual(result.methodology_meta["methodologies"], ["mom_test"])
        self.assertEqual(result.methodology_meta["category"], "custdev")

    async def test_refinement_skips_selection_and_keeps_templates(self):
        pages = [
            {
                "title": "p",
                "fields": [
                    {"id": "f1", "type": "shortText", "label": "Старый"},
                    {
                        "id": "att",
                        "type": "radio",
                        "label": "Выберите",
                        "required": True,
                        "options": [{"id": "o1", "label": "Скорее согласен"}],
                        "config": {
                            "methodology": "attention_check",
                            "attentionCheck": True,
                            "attentionCorrect": "Скорее согласен",
                        },
                    },
                ],
            }
        ]
        meta = {
            "category": "academic_survey",
            "methodologies": ["attention_check"],
            "subject": "вуза",
        }
        generated = _generation(
            [
                {
                    "title": "p",
                    "fields": [
                        {"id": "f1", "type": "shortText", "label": "Новый"},
                        {
                            "id": "att",
                            "type": "radio",
                            "label": "Выберите",
                            "required": True,
                            "options": ["Скорее согласен"],
                            "methodology": "attention_check",
                        },
                    ],
                }
            ]
        )
        llm = AsyncMock(side_effect=[generated])
        with patch.object(builder, "post_chat_completion", llm):
            result = await builder.build_survey(
                _request("Переименуй вопрос", pages=pages, methodology_meta=meta)
            )
        self.assertEqual(llm.await_count, 1)
        fields = _flatten(result.pages)
        att = next(f for f in fields if f.get("id") == "att")
        self.assertTrue(att["config"]["attentionCheck"])
        self.assertEqual(att["config"]["attentionCorrect"], "Скорее согласен")
        self.assertEqual(len(fields), 2)
        self.assertEqual(next(f for f in fields if f.get("id") == "f1")["label"], "Новый")

    async def test_explicit_methodologies_add_blocks_even_without_model_changes(self):
        pages = [{"title": "p", "fields": [{"id": "f1", "type": "shortText", "label": "Q"}]}]
        llm = AsyncMock(side_effect=[json.dumps({"reply": "ok", "title": None, "pages": None})])
        with patch.object(builder, "post_chat_completion", llm):
            result = await builder.build_survey(
                _request("Добавь SUS", pages=pages, methodology_ids=["sus"])
            )
        self.assertEqual(llm.await_count, 1)
        fields = _flatten(result.pages)
        self.assertEqual(len([f for f in fields if f.get("config", {}).get("methodology") == "sus"]), 10)
        self.assertEqual(result.pages[-1]["title"], "Оценка юзабилити (SUS)")
        self.assertEqual(fields[0]["id"], "f1")

    async def test_unparseable_output_returns_message_only(self):
        llm = AsyncMock(side_effect=[_select(), "not json"])
        with patch.object(builder, "post_chat_completion", llm):
            result = await builder.build_survey(_request())
        self.assertIsNone(result.pages)
        self.assertIn("Не удалось", result.reply)


class RoutesTests(unittest.TestCase):
    def test_survey_routes_are_registered(self):
        from app.main import app

        paths = set(app.openapi()["paths"])
        for path in (
            "/surveys",
            "/surveys/ai-builder",
            "/surveys/{survey_id}/responses/export.csv",
            "/surveys/{survey_id}/methodology-report",
            "/methodologies",
            "/methodologies/report",
            "/public/surveys/{token}",
            "/public/surveys/{token}/responses",
        ):
            self.assertIn(path, paths)


if __name__ == "__main__":
    unittest.main()


class PromptTests(unittest.TestCase):
    def test_generation_prompt_has_rules_and_no_file_types(self):
        prompt = builder._build_generation_prompt(["mom_test"], "сервиса")
        self.assertIn("Mom Test", prompt)
        self.assertIn("сервиса", prompt)
        self.assertNotIn("file_image", prompt)
        self.assertIn("shortText", prompt)
