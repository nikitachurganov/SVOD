from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services import billing_mail, email_service

USER = SimpleNamespace(email="anna@example.com", first_name="Анна")
ENDS = datetime(2026, 11, 20, 18, 30, tzinfo=timezone.utc)
SUBSCRIPTION_URL = "https://surveys.example.ru/profile?tab=subscription"


class SendNoticeTests(unittest.IsolatedAsyncioTestCase):
    async def send(self, **kwargs):
        with patch.object(email_service, "send_email", AsyncMock(return_value=True)) as send:
            sent = await email_service.send_notice(to="a@b.c", subject="Тема", **kwargs)
        self.assertTrue(sent)
        return send.await_args.kwargs

    async def test_text_and_html_carry_the_greeting_paragraphs_and_the_button(self):
        sent = await self.send(
            first_name="Анна",
            paragraphs=["Первый абзац.", "Второй абзац."],
            action_label="Открыть",
            action_url="https://example.ru/profile",
        )

        self.assertEqual(sent["to"], "a@b.c")
        self.assertEqual(sent["subject"], "Тема")
        self.assertEqual(
            sent["text"],
            "Здравствуйте, Анна!\n\nПервый абзац.\nВторой абзац.\n\nОткрыть: https://example.ru/profile",
        )
        self.assertIn("<p>Первый абзац.</p>", sent["html_body"])
        self.assertIn('href="https://example.ru/profile"', sent["html_body"])
        self.assertIn(">Открыть</a>", sent["html_body"])

    async def test_no_button_without_both_the_label_and_the_address(self):
        for extra in ({}, {"action_label": "Открыть"}, {"action_url": "https://example.ru"}):
            with self.subTest(extra=extra):
                sent = await self.send(first_name="Анна", paragraphs=["Текст."], **extra)
                self.assertNotIn("<a ", sent["html_body"])
                self.assertEqual(sent["text"], "Здравствуйте, Анна!\n\nТекст.")

    async def test_markup_in_names_and_paragraphs_is_escaped(self):
        sent = await self.send(first_name="<b>Анна</b>", paragraphs=["Тариф «<i>X</i>»"])

        self.assertNotIn("<b>", sent["html_body"])
        self.assertIn("&lt;b&gt;Анна&lt;/b&gt;", sent["html_body"])
        self.assertIn("&lt;i&gt;X&lt;/i&gt;", sent["html_body"])


class BillingMailTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.notice = patch.object(
            billing_mail.email_service, "send_notice", AsyncMock(return_value=True)
        ).start()
        patch.object(billing_mail.settings, "SURVEYS_APP_PUBLIC_URL", "https://surveys.example.ru/").start()
        patch.object(billing_mail.settings, "APP_PUBLIC_URL", "https://app.example.ru").start()
        self.addCleanup(patch.stopall)

    def sent(self):
        return self.notice.await_args.kwargs

    def text(self):
        return " ".join(self.sent()["paragraphs"])

    async def test_every_email_goes_to_the_person_by_name(self):
        await billing_mail.send_trial_ending(USER, ENDS)

        self.assertEqual((self.sent()["to"], self.sent()["first_name"]), ("anna@example.com", "Анна"))

    async def test_links_lead_to_the_subscription_tab_of_the_surveys_service(self):
        await billing_mail.send_trial_ending(USER, ENDS)

        self.assertEqual(self.sent()["action_url"], SUBSCRIPTION_URL)

    async def test_without_a_surveys_address_the_main_one_is_used(self):
        with patch.object(billing_mail.settings, "SURVEYS_APP_PUBLIC_URL", ""):
            await billing_mail.send_trial_ending(USER, ENDS)

        self.assertEqual(self.sent()["action_url"], "https://app.example.ru/profile?tab=subscription")

    async def test_the_result_of_sending_is_returned(self):
        self.notice.return_value = False

        self.assertFalse(await billing_mail.send_trial_ending(USER, ENDS))

    async def test_trial_ending_names_the_date(self):
        await billing_mail.send_trial_ending(USER, ENDS)

        self.assertIn("20.11.2026", self.text())
        self.assertIn("Пробный период", self.sent()["subject"])

    async def test_trial_ended_tells_about_closed_surveys_only_when_there_were_some(self):
        await billing_mail.send_trial_ended(USER, 0)
        self.assertNotIn("закрыли", self.text())

        await billing_mail.send_trial_ended(USER, 2)
        self.assertIn("закрыли", self.text())
        self.assertIn("2", self.text())
        self.assertIn("Ничего не удалено", self.text())

    async def test_plan_emails_name_the_plan(self):
        await billing_mail.send_plan_ending(USER, "Исследователь", ENDS)
        self.assertIn("«Исследователь»", self.text())
        self.assertIn("20.11.2026", self.text())
        self.assertEqual(self.sent()["action_label"], "Продлить тариф")

        await billing_mail.send_plan_ended(USER, "Исследователь", 1)
        self.assertIn("«Исследователь» закончился", self.text())
        self.assertIn("закрыли", self.text())

    async def test_limit_warning_speaks_of_the_right_limit(self):
        await billing_mail.send_limit_warning(USER, "ai_actions", 12, 15)
        self.assertIn("12 из 15 ИИ-действий", self.text())
        self.assertIn("кнопки ИИ перестанут работать", self.text())

        await billing_mail.send_limit_warning(USER, "responses", 80, 100)
        self.assertIn("80 из 100 ответов", self.text())
        self.assertIn("Респондентам это незаметно", self.text())

    async def test_an_unknown_limit_still_produces_a_sensible_email(self):
        self.assertTrue(await billing_mail.send_limit_warning(USER, "something_new", 4, 5))

    async def test_deletion_reminder_counts_the_days(self):
        await billing_mail.send_deletion_reminder(USER, ENDS, 7)
        self.assertIn("через 7 дн.", self.text())
        self.assertEqual(self.sent()["action_label"], "Отменить удаление")

        await billing_mail.send_deletion_reminder(USER, ENDS, 1)
        self.assertIn("завтра", self.text())

    async def test_account_deleted_goes_to_the_saved_address_with_no_button(self):
        await billing_mail.send_account_deleted("old@example.com", "Анна")

        self.assertEqual((self.sent()["to"], self.sent()["first_name"]), ("old@example.com", "Анна"))
        self.assertIsNone(self.sent().get("action_url"))

    async def test_blocked_deletion_lists_the_organizations(self):
        await billing_mail.send_deletion_blocked(USER, ["Команда", "Кафедра"])

        self.assertIn("«Команда», «Кафедра»", self.text())
        self.assertEqual(self.sent()["action_url"], "https://surveys.example.ru/profile")


if __name__ == "__main__":
    unittest.main()
