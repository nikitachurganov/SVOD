from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy.dialects import postgresql

from app.repositories import survey_repository as repo

SURVEY_ID = uuid.uuid4()
VISIBLE = "survey_responses.locked IS false"


class RecordingSession:
    """Remembers the SQL it was asked to run and answers as an empty database would."""

    def __init__(self):
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        result = MagicMock()
        result.scalar_one.return_value = 0
        result.scalar_one_or_none.return_value = None
        result.scalars.return_value.all.return_value = []
        result.all.return_value = []
        result.rowcount = 0
        return result

    def sql(self) -> list[str]:
        return [str(s.compile(dialect=postgresql.dialect())) for s in self.statements]


class EveryReadHidesLockedResponsesTests(unittest.IsolatedAsyncioTestCase):
    """A response kept back by the quota must not leak through any read of the repository."""

    def setUp(self):
        self.session = RecordingSession()

    def assert_hidden(self, *, minimum_statements=1):
        statements = self.session.sql()
        self.assertGreaterEqual(len(statements), minimum_statements)
        for sql in statements:
            self.assertIn(VISIBLE, sql)

    async def test_counts_per_survey(self):
        await repo.response_counts(self.session, [SURVEY_ID])
        self.assert_hidden()

    async def test_last_response_dates(self):
        await repo.last_response_dates(self.session, [SURVEY_ID])
        self.assert_hidden()

    async def test_list_of_responses_for_analysis_and_export(self):
        await repo.list_responses(self.session, SURVEY_ID, limit=100)
        self.assert_hidden()

    async def test_count_of_responses_by_default(self):
        await repo.count_responses(self.session, SURVEY_ID)
        await repo.count_responses(self.session, SURVEY_ID, flagged_only=True)
        self.assert_hidden(minimum_statements=2)

    async def test_one_response_by_id(self):
        await repo.get_response(self.session, SURVEY_ID, uuid.uuid4())
        self.assert_hidden()

    async def test_the_page_of_numbered_responses_and_its_total(self):
        await repo.list_numbered_responses(self.session, SURVEY_ID, limit=20, offset=0, flagged=True)
        self.assert_hidden(minimum_statements=2)
        # The page statement filters twice: the numbering subquery and the page itself
        self.assertGreaterEqual(self.session.sql()[0].count(VISIBLE), 2)

    async def test_the_number_of_a_response(self):
        await repo.response_number(self.session, SURVEY_ID, uuid.uuid4())
        self.assert_hidden()

    async def test_the_neighbours_of_a_response(self):
        response = SimpleNamespace(id=uuid.uuid4(), submitted_at=datetime.now(timezone.utc))
        await repo.neighbour_response_ids(self.session, SURVEY_ID, response)
        self.assert_hidden(minimum_statements=2)

    async def test_the_last_response_time(self):
        await repo.last_response_at(self.session, SURVEY_ID)
        self.assert_hidden()


class WhatDoesNotHideThemTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = RecordingSession()

    async def test_the_full_count_for_the_structure_lock_sees_them(self):
        await repo.count_responses(self.session, SURVEY_ID, include_locked=True)

        self.assertNotIn("locked", self.session.sql()[0])

    async def test_deleting_demo_responses_is_not_about_the_quota(self):
        await repo.delete_demo_responses(self.session, SURVEY_ID)

        self.assertNotIn("locked", self.session.sql()[0])


class OwnerScopedStatementsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = RecordingSession()
        self.owner = uuid.uuid4()

    async def test_counting_locked_responses_goes_through_the_owner_of_the_organization(self):
        await repo.count_locked_for_owner(self.session, self.owner)

        sql = self.session.sql()[0]
        self.assertIn("survey_responses.locked IS true", sql)
        self.assertIn("organizations.owner_user_id", sql)

    async def test_unlocking_touches_only_locked_responses_of_the_owners_surveys(self):
        opened = await repo.unlock_responses_for_owner(self.session, self.owner)

        sql = self.session.sql()[0]
        self.assertEqual(opened, 0)
        self.assertTrue(sql.startswith("UPDATE survey_responses SET locked="))
        self.assertIn("survey_responses.locked IS true", sql)
        self.assertIn("organizations.owner_user_id", sql)


if __name__ == "__main__":
    unittest.main()
