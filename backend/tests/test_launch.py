from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app import billing_cli
from app.services import launch_service, ops_alert_service
from app.services.launch_service import FAIL, OK, WARN

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
HEAD = "042_payments"


def levels(checks):
    return {check.name: check.level for check in checks}


class PreflightTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        s = launch_service.settings
        for name, value in dict(
            BILLING_ENABLED=True,
            BILLING_ENFORCE=False,
            SECRET_KEY="k" * 48,
            SURVEYS_APP_PUBLIC_URL="https://surveys.example.ru",
            APP_PUBLIC_URL="https://app.example.ru",
            ADMIN_NOTIFY_EMAIL="boss@example.ru",
            AI_DAILY_BUDGET_USD=5.0,
            OPENROUTER_MANAGEMENT_KEY="mgmt",
            OPENROUTER_LOW_BALANCE_USD=5.0,
            YOOKASSA_SHOP_ID="1",
            YOOKASSA_SECRET_KEY="s",
            YOOKASSA_VERIFY_WEBHOOK_IP=True,
            BILLING_PAST_DUE_GRACE_DAYS=3,
        ).items():
            patch.object(s, name, value).start()
        patch.object(launch_service.email_service, "is_configured", return_value=True).start()
        repo = launch_service.launch_repository
        self.admins = patch.object(repo, "count_active_admins", AsyncMock(return_value=1)).start()
        self.revision = patch.object(repo, "current_revision", AsyncMock(return_value=HEAD)).start()
        self.counters = patch.object(repo, "response_counters", AsyncMock(return_value=(0, 0))).start()
        patch.object(repo, "count_users", AsyncMock(return_value=40)).start()
        patch.object(repo, "count_locked_responses", AsyncMock(return_value=0)).start()
        self.stuck = patch.object(repo, "count_open_payments", AsyncMock(return_value=0)).start()
        self.tiers = patch.object(
            launch_service.admin_repository,
            "tier_totals",
            AsyncMock(return_value={"paid": 30, "trial": 2, "free": 8, "past_due": 0}),
        ).start()
        self.pending = patch.object(
            launch_service.plan_request_repository, "count_pending", AsyncMock(return_value=0)
        ).start()
        self.addCleanup(patch.stopall)

    async def check(self):
        return await launch_service.preflight(MagicMock(), head_revision=HEAD, now=NOW)

    async def test_a_ready_service_has_no_failures_and_no_warnings(self):
        checks = await self.check()

        self.assertEqual({c.level for c in checks}, {OK})
        self.assertFalse(launch_service.has_failures(checks))
        self.assertIn("Критичных замечаний нет", launch_service.format_checks(checks))

    async def test_switched_off_plans_are_a_failure(self):
        with patch.object(launch_service.settings, "BILLING_ENABLED", False):
            self.assertEqual(levels(await self.check())["Тарифы выключены"], FAIL)

    async def test_a_default_or_short_secret_is_a_failure(self):
        for secret in ("change-me", "short"):
            with self.subTest(secret=secret), patch.object(launch_service.settings, "SECRET_KEY", secret):
                self.assertEqual(levels(await self.check())["Слабый SECRET_KEY"], FAIL)

    async def test_no_administrator_is_a_failure(self):
        self.admins.return_value = 0

        checks = await self.check()

        self.assertEqual(levels(checks)["Нет администратора"], FAIL)
        self.assertTrue(launch_service.has_failures(checks))
        self.assertIn("Запускать нельзя", launch_service.format_checks(checks))

    async def test_a_database_behind_the_code_is_a_failure(self):
        self.revision.return_value = "040_subscription_lifecycle"

        self.assertEqual(levels(await self.check())["Миграции"], FAIL)

    async def test_an_unknown_head_is_only_a_warning(self):
        checks = await launch_service.preflight(MagicMock(), head_revision=None, now=NOW)

        self.assertEqual(levels(checks)["Миграции"], WARN)

    async def test_the_missing_pieces_of_operations_are_warnings(self):
        patch.object(launch_service.email_service, "is_configured", return_value=False).start()
        self.assertEqual(levels(await self.check())["Почта не настроена"], WARN)
        for name, value, title in (
            ("ADMIN_NOTIFY_EMAIL", "", "Почта администратора"),
            ("AI_DAILY_BUDGET_USD", 0.0, "Нет потолка расходов на ИИ"),
            ("OPENROUTER_MANAGEMENT_KEY", "", "Баланс OpenRouter не отслеживается"),
            ("YOOKASSA_SHOP_ID", "", "Онлайн-оплата не подключена"),
            ("SURVEYS_APP_PUBLIC_URL", "http://localhost:5174", "Публичный адрес"),
        ):
            with self.subTest(name=name), patch.object(launch_service.settings, name, value), patch.object(
                launch_service.settings, "APP_PUBLIC_URL", value if name == "SURVEYS_APP_PUBLIC_URL" else "https://a.ru"
            ):
                self.assertEqual(levels(await self.check())[title], WARN)

    async def test_counters_left_by_shadow_mode_must_be_reset_before_enforcing(self):
        self.counters.return_value = (12, 480)

        checks = await self.check()

        warned = [c for c in checks if c.level == WARN and "Счётчик ответов" in c.name]
        self.assertEqual(len(warned), 1)
        self.assertIn("reset-response-counters", warned[0].detail)
        self.assertIn("480", warned[0].detail)

    async def test_when_the_limits_already_block_the_counters_are_no_longer_a_concern(self):
        self.counters.return_value = (12, 480)
        with patch.object(launch_service.settings, "BILLING_ENFORCE", True):
            checks = await self.check()

        self.assertNotIn("Счётчик ответов накопился в теневом режиме", levels(checks))
        self.assertEqual(levels(checks)["Лимиты блокируют"], OK)

    async def test_nobody_on_a_paid_plan_warns_that_everybody_falls_to_the_free_one(self):
        self.tiers.return_value = {"paid": 0, "trial": 0, "free": 40, "past_due": 0}

        checks = await self.check()

        self.assertEqual(levels(checks)["Никто не на платном тарифе"], WARN)
        self.assertIn("grant-beta", next(c for c in checks if c.name == "Никто не на платном тарифе").detail)

    async def test_requests_locked_responses_and_stuck_payments_are_shown(self):
        self.pending.return_value = 3
        self.stuck.return_value = 2
        patch.object(
            launch_service.launch_repository, "count_locked_responses", AsyncMock(return_value=7)
        ).start()

        names = levels(await self.check())

        self.assertEqual(
            (names["Заявки на тариф"], names["Скрытые ответы"], names["Платежи без итога"]), (WARN, WARN, WARN)
        )


class ResetTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.read = patch.object(
            launch_service.launch_repository, "response_counters", AsyncMock(return_value=(5, 321))
        ).start()
        self.delete = patch.object(
            launch_service.launch_repository, "delete_response_counters", AsyncMock(return_value=5)
        ).start()
        self.addCleanup(patch.stopall)

    async def test_a_dry_run_counts_and_changes_nothing(self):
        result = await launch_service.reset_response_counters(MagicMock(), dry_run=True)

        self.assertEqual(result, (5, 321))
        self.delete.assert_not_awaited()

    async def test_the_real_run_deletes_the_counters(self):
        result = await launch_service.reset_response_counters(MagicMock(), dry_run=False)

        self.assertEqual(result, (5, 321))
        self.delete.assert_awaited_once()

    async def test_with_nothing_counted_nothing_is_deleted(self):
        self.read.return_value = (0, 0)

        await launch_service.reset_response_counters(MagicMock(), dry_run=False)

        self.delete.assert_not_awaited()


class FunnelTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_report_shows_shares_of_the_registered(self):
        counts = dict(
            registered=200, email_verified=150, created_survey=80, got_response=40, used_trial=20, paid_online=6, on_paid_plan=8
        )
        with patch.object(launch_service.launch_repository, "funnel", AsyncMock(return_value=counts)) as query:
            result, report = await launch_service.funnel(MagicMock(), days=14, now=NOW)

        self.assertEqual(result, counts)
        self.assertEqual(query.await_args.kwargs["since"], NOW - timedelta(days=14))
        self.assertIn("Зарегистрировались за 14 дн.", report)
        self.assertIn("Подтвердили почту: 150 (75 %)", report)
        self.assertIn("Платили онлайн: 6 (3 %)", report)

    async def test_nobody_registered_gives_dashes_not_a_division_by_zero(self):
        counts = {k: 0 for k in ("registered", "email_verified", "created_survey", "got_response", "used_trial", "paid_online", "on_paid_plan")}
        with patch.object(launch_service.launch_repository, "funnel", AsyncMock(return_value=counts)):
            _, report = await launch_service.funnel(MagicMock(), days=30, now=NOW)

        self.assertIn("Создали опрос: 0 (—)", report)


class CliTests(unittest.TestCase):
    def run_cli(self, command, checks=None, extra=()):
        session = MagicMock()
        session.commit = AsyncMock()
        factory = MagicMock()
        factory.return_value.__aenter__ = AsyncMock(return_value=session)
        factory.return_value.__aexit__ = AsyncMock(return_value=False)
        with (
            patch.object(billing_cli, "async_session_factory", factory),
            patch.object(billing_cli, "engine", MagicMock(dispose=AsyncMock())),
            patch.object(billing_cli.launch_service, "preflight", AsyncMock(return_value=checks or [])),
            patch.object(billing_cli, "_head_revision", return_value=HEAD),
            patch(
                "app.billing_cli.launch_service.reset_response_counters",
                AsyncMock(return_value=(4, 90)),
            ),
            patch("builtins.print") as printed,
        ):
            code = billing_cli.main([command, *extra])
        return code, session, printed

    def test_preflight_exits_with_1_when_something_is_wrong(self):
        code, _, printed = self.run_cli("preflight", [launch_service.Check(FAIL, "Нет администратора", "назначьте")])

        self.assertEqual(code, 1)
        self.assertIn("[FAIL] Нет администратора", printed.call_args.args[0])

    def test_preflight_exits_with_0_when_only_warnings_remain(self):
        code, _, _ = self.run_cli("preflight", [launch_service.Check(WARN, "Почта", "нет")])

        self.assertEqual(code, 0)

    def test_the_counters_are_reset_and_committed(self):
        code, session, printed = self.run_cli("reset-response-counters")

        self.assertEqual(code, 0)
        session.commit.assert_awaited_once()
        self.assertIn("обнулены: 4", printed.call_args_list[0].args[0])

    def test_a_dry_run_says_what_would_happen(self):
        _, _, printed = self.run_cli("reset-response-counters", extra=("--dry-run",))

        self.assertIn("были бы обнулены", printed.call_args_list[0].args[0])


def make_alert_env(test: unittest.IsolatedAsyncioTestCase, **overrides):
    values = dict(
        ADMIN_NOTIFY_EMAIL="boss@example.ru",
        AI_DAILY_BUDGET_USD=0.0,
        OPENROUTER_MANAGEMENT_KEY="",
        OPENROUTER_LOW_BALANCE_USD=5.0,
        OPS_ALERT_COOLDOWN_MINUTES=360,
        BILLING_ENABLED=True,
        YOOKASSA_SHOP_ID="",
        YOOKASSA_SECRET_KEY="",
    )
    values.update(overrides)
    for name, value in values.items():
        patch.object(ops_alert_service.settings, name, value).start()
    ops_alert_service._last_sent.clear()
    ops_alert_service._balance_checked_at = None
    test.addCleanup(patch.stopall)


class AiAlertTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        make_alert_env(self)
        self.outcomes = patch.object(
            ops_alert_service.launch_repository, "ai_outcomes_since", AsyncMock(return_value=(0, 0))
        ).start()

    async def keys(self):
        return [a.key for a in await ops_alert_service.collect(MagicMock(), NOW)]

    async def test_a_wave_of_failed_ai_actions_raises_an_alert(self):
        self.outcomes.return_value = (20, 12)

        self.assertEqual(await self.keys(), ["ai_failing"])

    async def test_a_few_calls_or_a_few_failures_are_not_an_outage(self):
        for outcome in ((9, 9), (20, 5), (0, 0), (10, 4)):
            with self.subTest(outcome=outcome):
                self.outcomes.return_value = outcome
                self.assertEqual(await self.keys(), [])

    async def test_the_window_is_the_last_half_hour(self):
        self.outcomes.return_value = (20, 12)
        await self.keys()

        self.assertEqual(self.outcomes.await_args.args[1], NOW - timedelta(minutes=30))


class BudgetAlertTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        make_alert_env(self, AI_DAILY_BUDGET_USD=10.0)
        patch.object(
            ops_alert_service.launch_repository, "ai_outcomes_since", AsyncMock(return_value=(0, 0))
        ).start()
        self.spent = patch.object(
            ops_alert_service.billing_repository, "sum_ai_cost_usd", AsyncMock(return_value=0)
        ).start()

    async def keys(self):
        return [a.key for a in await ops_alert_service.collect(MagicMock(), NOW)]

    async def test_below_eighty_percent_is_quiet(self):
        self.spent.return_value = 7.9

        self.assertEqual(await self.keys(), [])

    async def test_eighty_percent_warns_and_the_cap_itself_alerts(self):
        self.spent.return_value = 8
        self.assertEqual(await self.keys(), ["ai_daily_budget_near"])
        self.spent.return_value = 10
        self.assertEqual(await self.keys(), ["ai_daily_budget_hit"])

    async def test_without_a_cap_nothing_is_watched(self):
        patch.object(ops_alert_service.settings, "AI_DAILY_BUDGET_USD", 0.0).start()
        self.spent.return_value = 1000

        self.assertEqual(await self.keys(), [])
        self.spent.assert_not_awaited()


class PaymentAlertTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        make_alert_env(self, YOOKASSA_SHOP_ID="1", YOOKASSA_SECRET_KEY="s")
        patch.object(
            ops_alert_service.launch_repository, "ai_outcomes_since", AsyncMock(return_value=(0, 0))
        ).start()
        self.failed = patch.object(
            ops_alert_service.launch_repository, "count_failed_payments", AsyncMock(return_value=0)
        ).start()
        self.open = patch.object(
            ops_alert_service.launch_repository, "count_open_payments", AsyncMock(return_value=0)
        ).start()

    async def keys(self):
        return [a.key for a in await ops_alert_service.collect(MagicMock(), NOW)]

    async def test_failed_payment_attempts_and_hanging_payments_raise_alerts(self):
        self.failed.return_value = 3
        self.open.return_value = 1

        self.assertEqual(await self.keys(), ["payments_failing", "payments_stuck"])

    async def test_one_or_two_failures_are_not_an_alert(self):
        self.failed.return_value = 2

        self.assertEqual(await self.keys(), [])

    async def test_without_online_payment_nothing_is_asked(self):
        patch.object(ops_alert_service.settings, "YOOKASSA_SHOP_ID", "").start()
        self.failed.return_value = 99

        self.assertEqual(await self.keys(), [])
        self.failed.assert_not_awaited()


class BalanceAlertTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        make_alert_env(self, OPENROUTER_MANAGEMENT_KEY="mgmt")
        patch.object(
            ops_alert_service.launch_repository, "ai_outcomes_since", AsyncMock(return_value=(0, 0))
        ).start()
        self.fetch = patch.object(
            ops_alert_service, "fetch_openrouter_balance", AsyncMock(return_value=50.0)
        ).start()

    async def keys(self, now=NOW):
        return [a.key for a in await ops_alert_service.collect(MagicMock(), now)]

    async def test_a_low_balance_alerts(self):
        self.fetch.return_value = 3.2

        self.assertEqual(await self.keys(), ["openrouter_balance_low"])

    async def test_a_healthy_balance_is_quiet(self):
        self.assertEqual(await self.keys(), [])

    async def test_without_a_management_key_nobody_is_asked(self):
        patch.object(ops_alert_service.settings, "OPENROUTER_MANAGEMENT_KEY", "").start()

        self.assertEqual(await self.keys(), [])
        self.fetch.assert_not_awaited()

    async def test_the_balance_is_read_at_most_every_half_hour(self):
        await self.keys(NOW)
        await self.keys(NOW + timedelta(minutes=10))
        self.assertEqual(self.fetch.await_count, 1)

        await self.keys(NOW + timedelta(minutes=31))
        self.assertEqual(self.fetch.await_count, 2)

    async def test_an_unreadable_balance_is_not_an_alert(self):
        self.fetch.side_effect = httpx.ConnectError("down")

        self.assertEqual(await self.keys(), [])

    async def test_the_balance_is_total_credits_less_usage_read_with_the_management_key(self):
        seen = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"data": {"total_credits": 20.5, "total_usage": 5.25}})

        real = httpx.AsyncClient
        patch.stopall()
        make_alert_env(self, OPENROUTER_MANAGEMENT_KEY="mgmt")
        with patch.object(
            ops_alert_service.httpx,
            "AsyncClient",
            lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
        ):
            balance = await ops_alert_service.fetch_openrouter_balance()

        self.assertEqual(balance, 15.25)
        self.assertEqual(seen[0].headers["Authorization"], "Bearer mgmt")
        self.assertEqual(seen[0].url.path, "/api/v1/credits")


class DeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        make_alert_env(self)
        self.mail = patch.object(
            ops_alert_service.billing_mail, "send_ops_alert", AsyncMock(return_value=True)
        ).start()
        patch.object(ops_alert_service.email_service, "is_configured", return_value=True).start()
        self.alert = ops_alert_service.Alert("ai_failing", "ИИ не отвечает", ["строка"])

    async def test_an_alert_is_mailed_and_logged_as_an_error(self):
        with self.assertLogs(ops_alert_service.logger, level="ERROR") as logged:
            raised = await ops_alert_service.deliver([self.alert], NOW)

        self.assertEqual(raised, ["ai_failing"])
        self.mail.assert_awaited_once_with(to="boss@example.ru", subject="ИИ не отвечает", lines=["строка"])
        self.assertIn("ai_failing", logged.output[0])

    async def test_the_same_alert_waits_out_its_cooldown(self):
        await ops_alert_service.deliver([self.alert], NOW)

        self.assertEqual(await ops_alert_service.deliver([self.alert], NOW + timedelta(hours=1)), [])
        self.assertEqual(
            await ops_alert_service.deliver([self.alert], NOW + timedelta(hours=6, minutes=1)), ["ai_failing"]
        )
        self.assertEqual(self.mail.await_count, 2)

    async def test_different_alerts_do_not_hold_each_other_back(self):
        other = ops_alert_service.Alert("payments_stuck", "Платежи", ["x"])

        raised = await ops_alert_service.deliver([self.alert, other], NOW)

        self.assertEqual(raised, ["ai_failing", "payments_stuck"])

    async def test_without_an_address_or_smtp_the_alert_is_only_logged(self):
        for override in ({"ADMIN_NOTIFY_EMAIL": ""},):
            with self.subTest(override=override), patch.object(
                ops_alert_service.settings, "ADMIN_NOTIFY_EMAIL", ""
            ):
                ops_alert_service._last_sent.clear()
                self.assertEqual(await ops_alert_service.deliver([self.alert], NOW), ["ai_failing"])
        self.mail.assert_not_awaited()
        ops_alert_service._last_sent.clear()
        with patch.object(ops_alert_service.email_service, "is_configured", return_value=False):
            await ops_alert_service.deliver([self.alert], NOW)
        self.mail.assert_not_awaited()

    async def test_a_failing_mail_server_does_not_break_the_step(self):
        self.mail.side_effect = RuntimeError("smtp down")

        self.assertEqual(await ops_alert_service.deliver([self.alert], NOW), ["ai_failing"])

    async def test_the_worker_step_returns_what_it_raised_and_closes_its_transaction(self):
        session = MagicMock()
        session.rollback = AsyncMock()
        with patch.object(ops_alert_service, "collect", AsyncMock(return_value=[self.alert])):
            result = await ops_alert_service.run(session, NOW)

        self.assertEqual(dict(result), {"ai_failing": 1})
        session.rollback.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
