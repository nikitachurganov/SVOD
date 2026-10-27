from __future__ import annotations

import unittest
import uuid
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.services import ai_meter, survey_service


class MeteringCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.survey = SimpleNamespace(id=uuid.uuid4(), name="Опрос", pages=[], ai_summary=None)
        self.user = SimpleNamespace(id=uuid.uuid4())
        self.session = MagicMock()
        self.session.commit = AsyncMock()
        self.metered = []

        @asynccontextmanager
        async def meter(user, name, *, survey_id=None):
            self.metered.append((user, name, survey_id))
            yield

        patch.object(ai_meter, "action", meter).start()
        patch.object(survey_service, "_get_for_member", AsyncMock(return_value=self.survey)).start()
        patch.object(
            survey_service.survey_repository, "list_responses", AsyncMock(return_value=[])
        ).start()
        self.addCleanup(patch.stopall)


class SummaryMeteringTests(MeteringCase):
    def setUp(self):
        super().setUp()
        self.stored = patch.object(survey_service, "_stored_summary", MagicMock(return_value=None)).start()
        patch.object(survey_service, "_to_ai_summary", MagicMock(return_value="summary")).start()
        patch.object(
            survey_service.survey_results, "build_results", MagicMock(return_value=SimpleNamespace(used=3))
        ).start()
        patch.object(
            survey_service.survey_ai_analysis_service, "segment_comparisons", MagicMock(return_value=[])
        ).start()
        self.generate = patch.object(
            survey_service.survey_ai_analysis_service,
            "generate_summary",
            AsyncMock(return_value=(["вывод"], [[]])),
        ).start()
        patch.object(survey_service.survey_repository, "update", AsyncMock()).start()

    async def summary(self, **payload):
        data = dict(exclude_flagged=True, force=False)
        data.update(payload)
        return await survey_service.generate_ai_summary(
            self.session, self.user, str(self.survey.id), SimpleNamespace(**data)
        )

    async def test_a_new_summary_is_charged_to_the_user_and_the_survey(self):
        await self.summary()

        self.assertEqual(self.metered, [(self.user, "ai_summary", self.survey.id)])
        self.generate.assert_awaited_once()

    async def test_a_summary_served_from_the_cache_is_free(self):
        self.stored.return_value = {"responses_used": 3, "exclude_flagged": True}

        result = await self.summary()

        self.assertEqual(result, "summary")
        self.assertEqual(self.metered, [])
        self.generate.assert_not_awaited()

    async def test_forcing_a_new_summary_is_charged_again(self):
        self.stored.return_value = {"responses_used": 3, "exclude_flagged": True}

        await self.summary(force=True)

        self.assertEqual(len(self.metered), 1)
        self.generate.assert_awaited_once()

    async def test_new_responses_make_the_cached_summary_stale_and_chargeable(self):
        self.stored.return_value = {"responses_used": 2, "exclude_flagged": True}

        await self.summary()

        self.assertEqual(len(self.metered), 1)


class ChatMeteringTests(MeteringCase):
    def setUp(self):
        super().setUp()
        self.chat = patch.object(
            survey_service.survey_ai_analysis_service, "chat", AsyncMock(return_value="answer")
        ).start()

    async def ask(self, last_role="user"):
        payload = SimpleNamespace(
            messages=[SimpleNamespace(role=last_role)], exclude_flagged=True
        )
        return await survey_service.ai_chat(self.session, self.user, str(self.survey.id), payload)

    async def test_an_answer_is_charged_to_the_user_and_the_survey(self):
        result = await self.ask()

        self.assertEqual(result, "answer")
        self.assertEqual(self.metered, [(self.user, "ai_chat", self.survey.id)])

    async def test_a_malformed_request_is_refused_before_it_is_charged(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.ask(last_role="assistant")

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(self.metered, [])
        self.chat.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
