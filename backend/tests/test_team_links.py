from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from app import main
from app.core import request_service
from app.services import join_request_service, organization_service


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
