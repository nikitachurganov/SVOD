from __future__ import annotations

import unittest
import unittest.mock
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from app import main
from app.core import request_service
from app.services import join_request_service, notification_service, organization_service


class _Addresses(unittest.TestCase):
    def setUp(self):
        for name, value in (
            ("APP_PUBLIC_URL", "https://app.example.com/"),
            ("SURVEYS_APP_PUBLIC_URL", "https://surveys.example.com/"),
        ):
            patch.object(request_service.settings, name, value).start()
        self.addCleanup(patch.stopall)
        self.addCleanup(request_service.set_service, None)


class CallingServiceTests(_Addresses):
    def test_the_main_app_is_the_default(self):
        request_service.set_service(None)

        self.assertEqual(request_service.current_service(), "platform")
        self.assertEqual(request_service.app_base_url(), "https://app.example.com")

    def test_the_surveys_header_selects_its_own_address(self):
        request_service.set_service(" Surveys ")

        self.assertEqual(request_service.app_base_url(), "https://surveys.example.com")

    def test_an_unknown_value_is_the_main_app(self):
        request_service.set_service("something")

        self.assertEqual(request_service.app_base_url(), "https://app.example.com")

    def test_without_a_separate_address_both_share_the_main_one(self):
        patch.object(request_service.settings, "SURVEYS_APP_PUBLIC_URL", "  ").start()
        request_service.set_service("surveys")

        self.assertEqual(request_service.app_base_url(), "https://app.example.com")

    def test_the_links_of_a_team_follow_the_caller(self):
        request_service.set_service("surveys")
        self.assertEqual(join_request_service.join_url("tok"), "https://surveys.example.com/join/tok")
        self.assertEqual(organization_service.activation_url("code"), "https://surveys.example.com/activate/code")

        request_service.set_service("platform")
        self.assertEqual(join_request_service.join_url("tok"), "https://app.example.com/join/tok")
        self.assertEqual(organization_service.activation_url("code"), "https://app.example.com/activate/code")


class MiddlewareTests(_Addresses, unittest.IsolatedAsyncioTestCase):
    async def test_the_header_of_the_request_reaches_the_handler(self):
        async def probe():
            return {"base": request_service.app_base_url()}

        main.app.add_api_route("/_probe_service", probe, methods=["GET"])
        self.addCleanup(
            lambda: main.app.router.routes.__setitem__(
                slice(None), [r for r in main.app.router.routes if getattr(r, "path", "") != "/_probe_service"]
            )
        )

        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            plain = await client.get("/_probe_service")
            surveys = await client.get("/_probe_service", headers={"X-App-Service": "surveys"})
            again = await client.get("/_probe_service")

        self.assertEqual(plain.json()["base"], "https://app.example.com")
        self.assertEqual(surveys.json()["base"], "https://surveys.example.com")
        # One request's service does not leak into the next
        self.assertEqual(again.json()["base"], "https://app.example.com")


class MyRoleTests(unittest.TestCase):
    def _org(self):
        now = datetime.now(timezone.utc)
        return SimpleNamespace(
            id=uuid.uuid4(),
            name="Команда",
            description=None,
            owner_user_id=uuid.uuid4(),
            owner=None,
            is_personal=False,
            created_at=now,
            updated_at=now,
        )

    def test_the_callers_role_is_in_the_answer(self):
        for tag, expected in (("owner", "owner"), ("admin", "admin"), ("editor", "editor"), ("reader", "reader")):
            with self.subTest(tag=tag):
                response = organization_service._to_org_response(self._org(), 2, my_role=tag)
                self.assertEqual(response.my_role, expected)

    def test_the_old_member_tag_is_an_editor(self):
        response = organization_service._to_org_response(self._org(), 2, my_role="member")

        self.assertEqual(response.my_role, "editor")

    def test_an_unknown_tag_is_the_weakest_role(self):
        response = organization_service._to_org_response(self._org(), 2, my_role="whatever")

        self.assertEqual(response.my_role, "reader")

    def test_an_answer_not_about_the_caller_has_no_role(self):
        response = organization_service._to_org_response(self._org(), 2)

        self.assertIsNone(response.my_role)


if __name__ == "__main__":
    unittest.main()


class NotificationsByServiceTests(unittest.TestCase):
    """One account, two services: the surveys bell must not carry the news of requests."""

    def setUp(self):
        self.addCleanup(request_service.set_service, None)
        self.user = SimpleNamespace(id=uuid.uuid4())

    def _sql(self):
        from sqlalchemy import select
        from app.models.notification import Notification

        conditions = notification_service._visible_in_service(self.user)
        return str(select(Notification.id).where(*conditions).compile(compile_kwargs={"literal_binds": False}))

    def test_the_main_app_sees_everything_of_the_person(self):
        request_service.set_service(None)
        sql = self._sql()
        self.assertIn("recipient_user_id", sql)
        self.assertIn("organizations.service =", sql)
        self.assertNotIn("request_id IS NULL", sql)

    def test_the_surveys_service_hides_the_news_about_requests(self):
        request_service.set_service("surveys")
        sql = self._sql()
        self.assertIn("request_id IS NULL", sql)
        self.assertIn("stage_id IS NULL", sql)


class TeamsOfTheServicesTests(unittest.IsolatedAsyncioTestCase):
    """The teams of the requests platform and of the surveys service do not mix."""

    def setUp(self):
        self.addCleanup(request_service.set_service, None)

    @staticmethod
    def _sql(stmt) -> str:
        return str(stmt.compile(compile_kwargs={"literal_binds": False}))

    async def _captured_statement(self, call):
        captured = {}

        class _Session:
            async def execute(self, stmt):
                captured["stmt"] = stmt
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

        await call(_Session())
        return self._sql(captured["stmt"])

    async def test_the_list_of_teams_can_be_limited_to_one_service(self):
        from app.repositories import organization_repository as repo

        user_id = uuid.uuid4()
        limited = await self._captured_statement(lambda s: repo.get_orgs_for_user(s, user_id, service="surveys"))
        unlimited = await self._captured_statement(lambda s: repo.get_orgs_for_user(s, user_id))
        self.assertIn("organizations.service =", limited)
        self.assertNotIn("organizations.service =", unlimited)

    async def test_the_invitations_can_be_limited_to_one_service(self):
        from app.repositories import organization_repository as repo

        user_id = uuid.uuid4()
        limited = await self._captured_statement(lambda s: repo.list_invitations_for_user(s, user_id, service="platform"))
        self.assertIn("organizations.service =", limited)

    async def test_a_new_team_belongs_to_the_service_it_was_made_in(self):
        from app.schemas.organization import CreateOrganizationRequest

        made = []

        async def fake_create(session, org):
            made.append(org)
            org.id = uuid.uuid4()
            org.created_at = org.updated_at = datetime.now(timezone.utc)
            org.description = org.description
            return org

        class _Session:
            async def commit(self):
                return None

        user = SimpleNamespace(id=uuid.uuid4())
        for header, expected in ((None, "platform"), ("surveys", "surveys")):
            request_service.set_service(header)
            with patch.object(organization_service.organization_repository, "create_org", fake_create), patch.object(
                organization_service.organization_repository, "add_member", unittest.mock.AsyncMock()
            ), patch.object(
                organization_service.organization_repository, "count_members", unittest.mock.AsyncMock(return_value=1)
            ), patch.object(organization_service, "_to_org_response", lambda *a, **k: None):
                await organization_service.create_organization(
                    _Session(), CreateOrganizationRequest(name="Team"), user
                )
            self.assertEqual(made[-1].service, expected)

    async def test_a_join_link_of_the_other_service_does_not_work(self):
        from fastapi import HTTPException

        org = SimpleNamespace(join_link_enabled=True, service="platform")

        class _Session:
            async def scalar(self, stmt):
                return org

        request_service.set_service("surveys")
        with self.assertRaises(HTTPException) as caught:
            await join_request_service._org_by_join_token(_Session(), "token")
        self.assertEqual(caught.exception.status_code, 404)
        request_service.set_service(None)
        self.assertIs(await join_request_service._org_by_join_token(_Session(), "token"), org)

