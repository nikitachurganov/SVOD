from __future__ import annotations

import unittest
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.api.routes import surveys as surveys_routes
from app.schemas.survey import SurveyAiBuildRequest, SurveyAiBuildResponse
from app.services import public_suggest_rate_limit


def _user(verified=True):
    return SimpleNamespace(
        id=uuid.uuid4(),
        email_verified_at=datetime.now(timezone.utc) if verified else None,
    )


def _payload():
    return SurveyAiBuildRequest(messages=[{"role": "user", "content": "Анкета для курсовой"}])


class BuildSurveyAccessTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        public_suggest_rate_limit._buckets.clear()
        self.addCleanup(public_suggest_rate_limit._buckets.clear)
        # The mailbox is only insisted on when the server can send the confirmation email
        smtp = patch.object(surveys_routes.email_service, "is_configured", return_value=True)
        smtp.start()
        self.addCleanup(smtp.stop)
        # The usage meter has its own tests; here it only records which action was charged
        self.metered = []

        @asynccontextmanager
        async def meter(user, name, *, survey_id=None):
            self.metered.append(name)
            yield

        metering = patch.object(surveys_routes.ai_meter, "action", meter)
        metering.start()
        self.addCleanup(metering.stop)

    async def _call(self, user, builder=None, payload=None):
        builder = builder or AsyncMock(return_value=SurveyAiBuildResponse(reply="Готово"))
        with patch.object(surveys_routes.survey_ai_builder_service, "build_survey", builder):
            result = await surveys_routes.build_survey_with_ai(payload or _payload(), MagicMock(), user)
        return result, builder

    async def test_a_new_survey_is_charged_as_a_build(self):
        await self._call(_user())

        self.assertEqual(self.metered, ["survey_build"])

    async def test_refining_existing_pages_is_charged_as_an_edit(self):
        payload = SurveyAiBuildRequest(
            messages=[{"role": "user", "content": "Добавь вопрос"}], pages=[{"title": "Стр. 1"}]
        )

        await self._call(_user(), payload=payload)

        self.assertEqual(self.metered, ["survey_edit"])

    async def test_a_refusal_of_the_meter_stops_the_builder(self):
        @asynccontextmanager
        async def refusing(user, name, *, survey_id=None):
            raise HTTPException(status_code=402, detail={"code": "limit_reached"})
            yield

        builder = AsyncMock()
        with patch.object(surveys_routes.ai_meter, "action", refusing):
            with self.assertRaises(HTTPException) as ctx:
                await self._call(_user(), builder)

        self.assertEqual(ctx.exception.status_code, 402)
        builder.assert_not_awaited()

    async def test_unconfirmed_mail_and_the_burst_limit_come_before_the_meter(self):
        with self.assertRaises(HTTPException):
            await self._call(_user(verified=False))
        with patch.object(surveys_routes, "check_public_suggest_limit", return_value=False):
            with self.assertRaises(HTTPException):
                await self._call(_user())

        self.assertEqual(self.metered, [])

    async def test_unverified_email_is_rejected_before_the_llm(self):
        builder = AsyncMock()
        with self.assertRaises(HTTPException) as ctx:
            await self._call(_user(verified=False), builder)

        self.assertEqual(ctx.exception.status_code, 403)
        builder.assert_not_awaited()

    async def test_unverified_email_does_not_use_up_the_burst_limit(self):
        user = _user(verified=False)
        with self.assertRaises(HTTPException):
            await self._call(user)

        self.assertNotIn(f"survey-ai:{user.id}", public_suggest_rate_limit._buckets)

    async def test_without_smtp_nobody_is_asked_to_confirm(self):
        with patch.object(surveys_routes.email_service, "is_configured", return_value=False):
            result, builder = await self._call(_user(verified=False))

        self.assertEqual(result.reply, "Готово")
        builder.assert_awaited_once()

    async def test_verified_user_gets_the_builder_result(self):
        result, builder = await self._call(_user())

        self.assertEqual(result.reply, "Готово")
        builder.assert_awaited_once()

    async def test_burst_limit_returns_429_before_the_llm(self):
        builder = AsyncMock()
        with patch.object(surveys_routes, "check_public_suggest_limit", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                await self._call(_user(), builder)

        self.assertEqual(ctx.exception.status_code, 429)
        builder.assert_not_awaited()

    async def test_limit_is_counted_per_user_and_shared_with_other_ai_routes(self):
        user = _user()
        with patch.object(surveys_routes, "check_public_suggest_limit", return_value=True) as check:
            await self._call(user)

        check.assert_called_once_with(f"survey-ai:{user.id}")

    async def test_real_limit_stops_the_request_after_the_window_budget(self):
        user = _user()
        budget = public_suggest_rate_limit._MAX_CALLS_PER_WINDOW
        for _ in range(budget):
            await self._call(user)

        with self.assertRaises(HTTPException) as ctx:
            await self._call(user)
        self.assertEqual(ctx.exception.status_code, 429)

        # Another user is not affected by the first one's bucket
        result, _ = await self._call(_user())
        self.assertEqual(result.reply, "Готово")


if __name__ == "__main__":
    unittest.main()
