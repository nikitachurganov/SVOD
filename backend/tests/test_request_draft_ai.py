from __future__ import annotations

import json
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import request_draft_ai_service as draft_ai


def _form(**overrides):
    data = dict(
        id=uuid.uuid4(),
        name="Печать",
        organization_id=uuid.uuid4(),
        archived=False,
        is_universal=False,
        usage_count=0,
        fields=[
            {
                "id": "p1",
                "title": "Основное",
                "fields": [
                    {"id": "subject", "type": "shortText", "label": "Тема", "required": True},
                    {"id": "details", "type": "longText", "label": "Описание", "required": False},
                    {
                        "id": "size",
                        "type": "dropdown",
                        "label": "Формат",
                        "required": True,
                        "options": [{"id": "o-a4", "label": "A4"}, {"id": "o-a3", "label": "A3"}],
                    },
                    {
                        "id": "grp",
                        "type": "group",
                        "label": "Сроки",
                        "children": [
                            {"id": "deadline", "type": "date", "label": "Срок", "required": False},
                            {"id": "mockup", "type": "file_image", "label": "Макет", "required": True},
                        ],
                    },
                    {"id": "paper", "type": "checkbox", "label": "Бумага", "options": ["Мелованная", "Офсет"]},
                ],
            }
        ],
    )
    data.update(overrides)
    return SimpleNamespace(**data)


class NormalizeValueTests(unittest.TestCase):
    def test_values_follow_web_storage_format(self):
        dropdown = {"type": "dropdown", "options": [{"id": "o1", "label": "Срочно"}]}
        radio = {"type": "radio", "options": [{"id": "r1", "label": "Да, нужен"}]}
        checkbox = {"type": "checkbox", "options": ["Мелованная", "Офсет"]}
        self.assertEqual(draft_ai.normalize_value(dropdown, "срочно"), "o1")
        self.assertEqual(draft_ai.normalize_value(radio, "да, нужен"), "Да, нужен")
        self.assertEqual(draft_ai.normalize_value(checkbox, ["Офсет", "Картон", "Офсет"]), ["Офсет"])
        self.assertEqual(draft_ai.normalize_value({"type": "number"}, "1 500,5"), 1500.5)
        self.assertEqual(draft_ai.normalize_value({"type": "number"}, "200"), 200)
        self.assertEqual(draft_ai.normalize_value({"type": "date"}, "2026-10-01"), "2026-10-01")
        self.assertEqual(draft_ai.normalize_value({"type": "dateTime"}, "2026-10-01T09:30:00"), "2026-10-01 09:30")
        self.assertEqual(draft_ai.normalize_value({"type": "yesNo"}, "Да"), "yes")
        self.assertEqual(draft_ai.normalize_value({"type": "shortText"}, "  Буклет "), "Буклет")

    def test_values_that_do_not_fit_are_dropped(self):
        self.assertIsNone(draft_ai.normalize_value({"type": "dropdown", "options": []}, "A5"))
        self.assertIsNone(draft_ai.normalize_value({"type": "date"}, "к пятнице"))
        self.assertIsNone(draft_ai.normalize_value({"type": "number"}, "много"))
        self.assertIsNone(draft_ai.normalize_value({"type": "checkbox", "options": ["A"]}, ["B"]))
        self.assertIsNone(draft_ai.normalize_value({"type": "shortText"}, "   "))
        self.assertIsNone(draft_ai.normalize_value({"type": "file_image"}, "photo.jpg"))


class SnapshotTests(unittest.TestCase):
    def test_snapshot_flattens_groups_and_normalizes_legacy_options(self):
        snapshot = draft_ai.build_form_snapshot(_form())
        ids = [f["id"] for f in snapshot["fields"]]
        self.assertEqual(ids, ["subject", "details", "size", "deadline", "mockup", "paper"])
        paper = snapshot["fields"][-1]
        self.assertEqual(paper["options"], [{"id": "Мелованная", "label": "Мелованная"}, {"id": "Офсет", "label": "Офсет"}])


class FillFormTests(unittest.IsolatedAsyncioTestCase):
    async def test_llm_answer_is_validated_against_the_schema(self):
        answer = json.dumps(
            {
                "title": "Напечатать буклеты",
                "summary": "Нужно 500 буклетов A3 к пятнице.",
                "priority": "high",
                "fields": {
                    "subject": "Буклеты",
                    "size": "A3",
                    "deadline": "2026-10-02",
                    "mockup": "file.png",
                    "unknown": "x",
                },
            },
            ensure_ascii=False,
        )
        with patch.object(draft_ai, "post_chat_completion", AsyncMock(return_value=f"```json\n{answer}\n```")):
            draft = await draft_ai.fill_form(_form(), "Напечатайте 500 буклетов A3 к пятнице")

        self.assertEqual(draft.title, "Напечатать буклеты")
        self.assertEqual(draft.priority, "high")
        self.assertEqual(draft.data, {"subject": "Буклеты", "size": "o-a3", "deadline": "2026-10-02"})
        self.assertEqual(draft.missing_required, ["Макет"])

    async def test_llm_failure_degrades_to_plain_text_draft(self):
        with patch.object(draft_ai, "post_chat_completion", AsyncMock(side_effect=RuntimeError("down"))):
            draft = await draft_ai.fill_form(_form(), "Сделать баннер\nРазмер 3x6, до конца месяца")

        self.assertEqual(draft.title, "Сделать баннер")
        self.assertEqual(draft.priority, "medium")
        # The description goes to the first long text field so it stays visible
        self.assertEqual(draft.data, {"details": "Сделать баннер\nРазмер 3x6, до конца месяца"})
        self.assertEqual(draft.missing_required, ["Тема", "Формат", "Макет"])

    async def test_unknown_priority_falls_back_to_medium(self):
        answer = json.dumps({"title": "T", "summary": "S", "priority": "asap", "fields": {"details": "D"}})
        with patch.object(draft_ai, "post_chat_completion", AsyncMock(return_value=answer)):
            draft = await draft_ai.fill_form(_form(), "текст задачи")
        self.assertEqual(draft.priority, "medium")
        self.assertEqual(draft.data, {"details": "D"})


class PickFormTests(unittest.IsolatedAsyncioTestCase):
    async def test_universal_form_is_the_fallback(self):
        org_id = uuid.uuid4()
        universal = _form(name="Универсальная", is_universal=True)
        other = _form(name="Дизайн", usage_count=5)
        with (
            patch.object(draft_ai.form_repository, "get_active_by_org", AsyncMock(return_value=[other, universal])),
            patch.object(
                draft_ai.public_form_suggest_service,
                "suggest_forms_for_org",
                AsyncMock(return_value=SimpleNamespace(forms=[])),
            ),
        ):
            best, ordered = await draft_ai._pick_forms(MagicMock(), org_id, "что-то непонятное")
        self.assertIs(best, universal)
        self.assertEqual([f.name for f in ordered], ["Универсальная", "Дизайн"])

    async def test_suggested_forms_go_first(self):
        design, print_form = _form(name="Дизайн"), _form(name="Печать")
        cards = [SimpleNamespace(id=str(print_form.id))]
        with (
            patch.object(draft_ai.form_repository, "get_active_by_org", AsyncMock(return_value=[design, print_form])),
            patch.object(
                draft_ai.public_form_suggest_service,
                "suggest_forms_for_org",
                AsyncMock(return_value=SimpleNamespace(forms=cards)),
            ),
        ):
            best, ordered = await draft_ai._pick_forms(MagicMock(), uuid.uuid4(), "напечатать листовки")
        self.assertIs(best, print_form)
        self.assertEqual(ordered, [print_form, design])

    async def test_no_active_forms(self):
        with patch.object(draft_ai.form_repository, "get_active_by_org", AsyncMock(return_value=[])):
            with self.assertRaises(draft_ai.DraftError):
                await draft_ai._pick_forms(MagicMock(), uuid.uuid4(), "текст")


if __name__ == "__main__":
    unittest.main()
