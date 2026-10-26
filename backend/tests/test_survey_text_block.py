"""Text blocks, the greeting page, Russian yes/no, and the AI parsing fixes."""

from __future__ import annotations

import json
import unittest
from unittest.mock import AsyncMock, patch

from app.schemas.survey import SurveyAiBuildRequest
from app.services import (
    form_ai_builder_service as forms_ai,
    survey_ai_analysis_service as analysis,
    survey_ai_builder_service as builder,
    survey_answers,
    survey_methodology_service,
    welcome_seed_service,
)


def _sanitize(raw, known=frozenset()):
    return forms_ai._sanitize_field(raw, known_ids=set(known), used_ids=set(), allow_group=True)


class SanitizerTests(unittest.TestCase):
    def test_trailing_colon_is_removed_from_labels(self):
        field = _sanitize({"type": "shortText", "label": "Готовы ли вы ответить?:"})
        self.assertEqual(field["label"], "Готовы ли вы ответить?")
        field = _sanitize({"type": "shortText", "label": "Ваше имя :  "})
        self.assertEqual(field["label"], "Ваше имя")

    def test_english_yes_no_options_become_russian(self):
        field = _sanitize({"type": "radio", "label": "Готовы?", "options": ["yes", "No", "Maybe"]})
        self.assertEqual(
            [o["label"] for o in field["options"]], ["Да", "Нет", "Затрудняюсь ответить"]
        )

    def test_text_block_keeps_heading_and_paragraphs(self):
        field = _sanitize(
            {"type": "textBlock", "label": "Привет!", "description": "Первый абзац.\n\nВторой."}
        )
        self.assertEqual(field["type"], "textBlock")
        self.assertEqual(field["label"], "Привет!")
        self.assertEqual(field["placeholder"], "Первый абзац.\n\nВторой.")
        self.assertFalse(field["required"])

    def test_empty_text_block_is_dropped(self):
        self.assertIsNone(_sanitize({"type": "textBlock", "label": "", "description": " "}))

    def test_raw_newlines_inside_json_strings_are_parsed(self):
        raw = '{"reply": "Факты: а\nИнтерпретация: б", "quote_ids": []}'
        self.assertEqual(forms_ai._parse_payload(raw)["reply"], "Факты: а\nИнтерпретация: б")


class TextBlockIsNotAQuestionTests(unittest.TestCase):
    PAGES = [
        {
            "fields": [
                {"id": "t", "type": "textBlock", "label": "Привет", "placeholder": "Текст"},
                {"id": "q", "type": "yesNo", "label": "Готовы?", "required": True},
            ]
        }
    ]

    def test_text_block_is_not_answerable_or_counted(self):
        ids = [f["id"] for f in survey_answers.answerable_fields(self.PAGES)]
        self.assertEqual(ids, ["q"])
        self.assertEqual(survey_methodology_service.count_questions(self.PAGES), 1)

    def test_text_block_does_not_make_an_answer_required(self):
        self.assertEqual(survey_answers.validate_answers(self.PAGES, {"q": "yes"}), {"q": "yes"})

    def test_yes_no_has_russian_options(self):
        field = survey_answers.answerable_fields(self.PAGES)[0]
        self.assertEqual([o["label"] for o in field["options"]], ["Да", "Нет"])
        defs = survey_answers.question_defs(self.PAGES)
        self.assertEqual([o["label"] for o in defs[0]["options"]], ["Да", "Нет"])


class WelcomePageTests(unittest.IsolatedAsyncioTestCase):
    QUESTIONS = [{"title": "Вопросы", "fields": [{"type": "shortText", "label": "Q"}] * 4}]

    def test_greeting_page_goes_first(self):
        pages = builder.insert_welcome_page(self.QUESTIONS, text="Мы изучаем расписание.")
        self.assertEqual(pages[0]["title"], builder.WELCOME_PAGE_TITLE)
        block = pages[0]["fields"][0]
        self.assertEqual(block["type"], "textBlock")
        self.assertIn("Мы изучаем расписание.", block["placeholder"])
        self.assertIn("около 2 мин", block["placeholder"])
        self.assertEqual(pages[1:], self.QUESTIONS)

    def test_default_text_is_used_without_model_text(self):
        pages = builder.insert_welcome_page(self.QUESTIONS, text=None)
        self.assertIn("Спасибо", pages[0]["fields"][0]["placeholder"])

    def test_existing_greeting_is_kept(self):
        once = builder.insert_welcome_page(self.QUESTIONS, text=None)
        self.assertEqual(builder.insert_welcome_page(once, text="Другой"), once)

    async def test_new_survey_gets_a_greeting_but_an_edit_does_not(self):
        generated = json.dumps(
            {
                "reply": "Готово",
                "title": "Опрос",
                "welcome": "Исследуем удовлетворённость студентов.",
                "pages": [{"title": "Основное", "fields": [{"type": "longText", "label": "Что улучшить?"}]}],
            },
            ensure_ascii=False,
        )
        select = json.dumps(
            {"category": "academic_survey", "goals": [], "methodologies": ["likert"], "subject": "вуза"}
        )
        request = SurveyAiBuildRequest(messages=[{"role": "user", "content": "Анкета"}])
        with patch.object(builder, "post_chat_completion", AsyncMock(side_effect=[select, generated])):
            result = await builder.build_survey(request)
        self.assertEqual(result.pages[0]["title"], builder.WELCOME_PAGE_TITLE)
        self.assertIn("Исследуем удовлетворённость студентов.", result.pages[0]["fields"][0]["placeholder"])

        existing = [{"title": "p", "fields": [{"id": "f1", "type": "shortText", "label": "Старый"}]}]
        edited = json.dumps(
            {
                "reply": "ок",
                "title": None,
                "pages": [{"title": "p", "fields": [{"id": "f1", "type": "shortText", "label": "Новый"}]}],
            }
        )
        meta = {"category": "academic_survey", "methodologies": ["likert"], "subject": "вуза"}
        request = SurveyAiBuildRequest(
            messages=[{"role": "user", "content": "Переименуй"}], pages=existing, methodology_meta=meta
        )
        with patch.object(builder, "post_chat_completion", AsyncMock(side_effect=[edited])):
            result = await builder.build_survey(request)
        self.assertEqual([p["title"] for p in result.pages], ["p"])

    def test_generation_prompt_describes_text_block_and_russian_options(self):
        prompt = builder._build_generation_prompt(["likert"], "вуза")
        self.assertIn("textBlock", prompt)
        self.assertIn("yesNo", prompt)
        self.assertIn("welcome", prompt)


class WelcomeSeedTests(unittest.TestCase):
    def test_sample_survey_has_greeting_questions_and_unique_ids(self):
        pages = welcome_seed_service.welcome_survey_pages()
        self.assertEqual(pages[0]["fields"][0]["type"], "textBlock")
        fields = list(survey_methodology_service.iter_leaf_fields(pages))
        self.assertGreaterEqual(len(fields), 4)
        ids = [f["id"] for f in fields] + [p["id"] for p in pages]
        self.assertEqual(len(ids), len(set(ids)))
        for field in fields:
            for option in field.get("options") or []:
                self.assertTrue(option["id"])


class AnalysisParsingTests(unittest.TestCase):
    def test_ids_are_removed_from_summary_text(self):
        raw = json.dumps(
            {
                "bullets": [
                    {
                        "text": "Выборка мала (n=7); все учатся сейчас (id: 2155662a, 46fb41e4).",
                        "question_ids": ["2155662a"],
                    },
                    {"text": "Больше всего времени заняло ожидание — 71,4% (id: 8676bae1).", "question_ids": []},
                ]
            },
            ensure_ascii=False,
        )
        bullets, evidence = analysis.parse_summary(raw, {"2155662a"})
        self.assertEqual(bullets[0], "Выборка мала (n=7); все учатся сейчас.")
        self.assertEqual(bullets[1], "Больше всего времени заняло ожидание — 71,4%.")
        self.assertEqual(evidence, [["2155662a"], []])

    def test_answer_with_raw_newlines_is_parsed(self):
        raw = '{"reply": "Факты: 5 из 7.\nИнтерпретация: мало данных.", "quote_ids": []}'
        reply, quotes = analysis.parse_answer(raw, {})
        self.assertIn("Интерпретация", reply)
        self.assertEqual(quotes, [])

    def test_plain_text_answer_is_shown_instead_of_an_error(self):
        reply, _ = analysis.parse_answer("Чаще всего упоминали Яндекс Формы (4 из 7).", {})
        self.assertEqual(reply, "Чаще всего упоминали Яндекс Формы (4 из 7).")

    def test_broken_json_still_yields_the_reply_text(self):
        raw = '```json\n{"reply": "Ответ с \\"кавычкой\\"", "quote_ids": ["r1"\n```'
        reply, _ = analysis.parse_answer(raw, {})
        self.assertEqual(reply, 'Ответ с "кавычкой"')

    def test_unusable_output_gives_an_empty_reply(self):
        self.assertEqual(analysis.parse_answer('{"quote_ids": []}', {})[0], "")
        self.assertEqual(analysis.parse_answer("", {})[0], "")


if __name__ == "__main__":
    unittest.main()
