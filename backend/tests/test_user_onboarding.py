from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.schemas.onboarding import OnboardingSurveyRequest, TourUpdateRequest
from app.services import onboarding_service


def row_ns(**overrides):
    data = dict(
        occupation=None,
        occupation_other=None,
        purposes=[],
        purpose_other=None,
        source=None,
        source_other=None,
        survey_completed_at=None,
        survey_dismissed_at=None,
        dismissible=False,
        tour_status="pending",
        tour_step=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


def survey(**overrides):
    data = dict(occupation="student", purposes=["study"], source="search")
    data.update(overrides)
    return OnboardingSurveyRequest(**data)


USER = SimpleNamespace(id=uuid.uuid4())


class BuildStateTests(unittest.TestCase):
    def test_new_person_must_answer(self):
        state = onboarding_service.build_state(None)
        self.assertTrue(state.needsSurvey)
        self.assertFalse(state.dismissible)
        self.assertFalse(state.surveyCompleted)
        self.assertEqual(state.tourStatus, "pending")

    def test_answered_person_is_not_asked_again(self):
        state = onboarding_service.build_state(row_ns(survey_completed_at=datetime.now(timezone.utc)))
        self.assertTrue(state.surveyCompleted)
        self.assertFalse(state.needsSurvey)

    def test_existing_account_may_close_the_questionnaire_once(self):
        asked = onboarding_service.build_state(row_ns(dismissible=True))
        self.assertTrue(asked.needsSurvey)
        self.assertTrue(asked.dismissible)

        closed = onboarding_service.build_state(
            row_ns(dismissible=True, survey_dismissed_at=datetime.now(timezone.utc))
        )
        self.assertFalse(closed.needsSurvey)
        self.assertFalse(closed.surveyCompleted)


class SubmitSurveyTests(unittest.IsolatedAsyncioTestCase):
    async def _submit(self, payload, row=None):
        row = row or row_ns()
        session = session_mock()
        with patch.object(
            onboarding_service.user_onboarding_repository, "get_or_create", AsyncMock(return_value=row)
        ):
            state = await onboarding_service.submit_survey(session, USER, payload)
        session.commit.assert_awaited_once()
        return row, state

    async def test_answers_are_saved_and_the_questionnaire_is_done(self):
        row, state = await self._submit(
            survey(occupation="marketer", purposes=["marketing", "events"], source="telegram")
        )
        self.assertEqual((row.occupation, row.purposes, row.source), ("marketer", ["marketing", "events"], "telegram"))
        self.assertIsNotNone(row.survey_completed_at)
        self.assertTrue(state.surveyCompleted)
        self.assertFalse(state.needsSurvey)

    async def test_free_text_is_kept_only_next_to_other(self):
        row, _ = await self._submit(
            survey(
                occupation="student",
                occupation_other="  лишнее ",
                purposes=["study", "other"],
                purpose_other="  Дипломная   работа ",
                source="search",
                source_other="тоже лишнее",
            )
        )
        self.assertIsNone(row.occupation_other)
        self.assertEqual(row.purpose_other, "Дипломная работа")
        self.assertIsNone(row.source_other)

    async def test_repeated_answers_keep_the_first_completion_time(self):
        first = datetime(2026, 1, 1, tzinfo=timezone.utc)
        row, _ = await self._submit(survey(), row_ns(survey_completed_at=first))
        self.assertEqual(row.survey_completed_at, first)

    def test_unknown_choices_and_empty_purposes_are_refused(self):
        for overrides in (
            dict(occupation="astronaut"),
            dict(source="carrier-pigeon"),
            dict(purposes=[]),
            dict(purposes=["study", "teleport"]),
        ):
            with self.subTest(overrides=overrides):
                with self.assertRaises(ValueError):
                    survey(**overrides)

    def test_duplicate_purposes_are_collapsed(self):
        self.assertEqual(survey(purposes=["study", "hr", "study"]).purposes, ["study", "hr"])

    def test_too_long_free_text_is_refused(self):
        with self.assertRaises(ValueError):
            survey(source="other", source_other="я" * 201)


class DismissSurveyTests(unittest.IsolatedAsyncioTestCase):
    async def _dismiss(self, row):
        session = session_mock()
        with patch.object(onboarding_service.user_onboarding_repository, "get", AsyncMock(return_value=row)):
            state = await onboarding_service.dismiss_survey(session, USER)
        return state, session

    async def test_existing_account_can_close_it(self):
        row = row_ns(dismissible=True)
        state, session = await self._dismiss(row)
        self.assertIsNotNone(row.survey_dismissed_at)
        self.assertFalse(state.needsSurvey)
        session.commit.assert_awaited_once()

    async def test_new_person_cannot_skip_the_questionnaire(self):
        for row in (None, row_ns(dismissible=False)):
            with self.subTest(row=row):
                with self.assertRaises(HTTPException) as ctx:
                    await self._dismiss(row)
                self.assertEqual(ctx.exception.status_code, 403)


class UpdateTourTests(unittest.IsolatedAsyncioTestCase):
    async def test_answer_and_step_are_remembered(self):
        row = row_ns()
        session = session_mock()
        with patch.object(
            onboarding_service.user_onboarding_repository, "get_or_create", AsyncMock(return_value=row)
        ):
            state = await onboarding_service.update_tour(
                session, USER, TourUpdateRequest(status="accepted", step="create-project")
            )
        self.assertEqual((row.tour_status, row.tour_step), ("accepted", "create-project"))
        self.assertEqual((state.tourStatus, state.tourStep), ("accepted", "create-project"))
        session.commit.assert_awaited_once()

    def test_unknown_status_is_refused(self):
        with self.assertRaises(ValueError):
            TourUpdateRequest(status="paused")


if __name__ == "__main__":
    unittest.main()
