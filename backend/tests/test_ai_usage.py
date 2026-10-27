from __future__ import annotations

import unittest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import ai_usage, openrouter_client


class RecordTests(unittest.TestCase):
    def setUp(self):
        self.collector = ai_usage.UsageCollector()
        token = ai_usage.activate(self.collector)
        self.addCleanup(ai_usage.deactivate, token)

    def test_reported_usage_is_added_up(self):
        ai_usage.record(
            {"prompt_tokens": 1000, "completion_tokens": 500, "cost": 0.00042}, "z-ai/glm-5.3-flash"
        )

        self.assertEqual(
            (self.collector.calls, self.collector.prompt_tokens, self.collector.completion_tokens),
            (1, 1000, 500),
        )
        self.assertEqual(self.collector.cost_usd, Decimal("0.00042"))
        self.assertEqual(self.collector.model, "z-ai/glm-5.3-flash")

    def test_calls_accumulate(self):
        ai_usage.record({"prompt_tokens": 10, "completion_tokens": 5, "cost": 0.001}, "a")
        ai_usage.record({"prompt_tokens": 20, "completion_tokens": 15, "cost": 0.002}, "b")

        self.assertEqual(
            (self.collector.calls, self.collector.prompt_tokens, self.collector.completion_tokens),
            (2, 30, 20),
        )
        self.assertEqual(self.collector.cost_usd, Decimal("0.003"))
        self.assertEqual(self.collector.model, "b")

    def test_missing_cost_is_estimated_from_the_token_prices(self):
        with (
            patch.object(ai_usage.settings, "OPENROUTER_PRICE_IN_USD_PER_M", 1.0),
            patch.object(ai_usage.settings, "OPENROUTER_PRICE_OUT_USD_PER_M", 4.0),
        ):
            ai_usage.record({"prompt_tokens": 1_000_000, "completion_tokens": 500_000}, None)

        # 1 dollar for the million prompt tokens and 2 for the half million completion tokens
        self.assertEqual(self.collector.cost_usd, Decimal(3))

    def test_a_reported_zero_cost_is_not_replaced_by_an_estimate(self):
        ai_usage.record({"prompt_tokens": 1000, "completion_tokens": 1000, "cost": 0}, None)

        self.assertEqual(self.collector.cost_usd, 0)

    def test_broken_usage_still_counts_the_call(self):
        for usage in (None, [], "text", {}, {"prompt_tokens": -5, "completion_tokens": True, "cost": -1}):
            with self.subTest(usage=usage):
                ai_usage.record(usage, None)

        self.assertEqual(self.collector.calls, 5)
        self.assertEqual((self.collector.prompt_tokens, self.collector.completion_tokens), (0, 0))
        self.assertEqual(self.collector.cost_usd, 0)

    def test_model_is_kept_when_a_response_does_not_name_one(self):
        ai_usage.record({}, "first")
        ai_usage.record({}, None)

        self.assertEqual(self.collector.model, "first")


class OutsideAnActionTests(unittest.TestCase):
    def test_nothing_is_collected_and_nothing_fails(self):
        self.assertIsNone(ai_usage._current.get())

        ai_usage.record({"prompt_tokens": 5}, "model")

        self.assertIsNone(ai_usage._current.get())


def completion(content="{}", finish="stop", usage=None, model="z-ai/glm-5.3-flash"):
    return {
        "choices": [{"message": {"content": content}, "finish_reason": finish}],
        "usage": usage,
        "model": model,
    }


def fake_http(*payloads):
    responses = []
    for payload in payloads:
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.json.return_value = payload
        responses.append(response)
    client = MagicMock()
    client.post = AsyncMock(side_effect=responses)
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=False)
    patcher = patch.object(openrouter_client.httpx, "AsyncClient", MagicMock(return_value=context))
    return patcher, client


class OpenRouterClientReportingTests(unittest.IsolatedAsyncioTestCase):
    def collect(self):
        collector = ai_usage.UsageCollector()
        token = ai_usage.activate(collector)
        self.addCleanup(ai_usage.deactivate, token)
        return collector

    async def test_usage_of_a_completion_is_reported(self):
        collector = self.collect()
        usage = {"prompt_tokens": 120, "completion_tokens": 80, "cost": 0.0005}
        patcher, _ = fake_http(completion('{"ok": true}', usage=usage, model="z-ai/glm-5.3-flash"))

        with patcher:
            answer = await openrouter_client.post_chat_completion([{"role": "user", "content": "hi"}])

        self.assertEqual(answer, '{"ok": true}')
        self.assertEqual((collector.calls, collector.prompt_tokens, collector.completion_tokens), (1, 120, 80))
        self.assertEqual(collector.cost_usd, Decimal("0.0005"))

    async def test_a_truncated_attempt_and_its_retry_are_both_counted(self):
        collector = self.collect()
        patcher, client = fake_http(
            completion("", finish="length", usage={"prompt_tokens": 100, "completion_tokens": 512, "cost": 0.002}),
            completion("{}", usage={"prompt_tokens": 100, "completion_tokens": 300, "cost": 0.001}),
        )

        with patcher:
            await openrouter_client.post_chat_completion([{"role": "user", "content": "hi"}])

        self.assertEqual(client.post.await_count, 2)
        self.assertEqual((collector.calls, collector.prompt_tokens, collector.completion_tokens), (2, 200, 812))
        self.assertEqual(collector.cost_usd, Decimal("0.003"))

    async def test_a_response_without_usage_is_still_a_call(self):
        collector = self.collect()
        patcher, _ = fake_http(completion("{}", usage=None))

        with patcher:
            await openrouter_client.post_chat_completion([{"role": "user", "content": "hi"}])

        self.assertEqual((collector.calls, collector.prompt_tokens), (1, 0))

    async def test_outside_an_action_the_client_works_as_before(self):
        patcher, _ = fake_http(completion("{}", usage={"prompt_tokens": 1}))

        with patcher:
            answer = await openrouter_client.post_chat_completion([{"role": "user", "content": "hi"}])

        self.assertEqual(answer, "{}")

    async def test_the_deprecated_usage_option_is_not_sent(self):
        # OpenRouter returns usage in every response; the old "usage": {"include": true} does nothing
        patcher, client = fake_http(completion("{}"))

        with patcher:
            await openrouter_client.post_chat_completion([{"role": "user", "content": "hi"}])

        self.assertNotIn("usage", client.post.await_args.kwargs["json"])


if __name__ == "__main__":
    unittest.main()
