from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.routes import public as public_routes
from app.api.routes import surveys as survey_routes
from app.core.client_ip import client_ip


def request(peer, headers=None):
    return SimpleNamespace(client=SimpleNamespace(host=peer) if peer is not None else None, headers=headers or {})


class ClientIpTests(unittest.TestCase):
    def test_behind_our_proxy_the_address_is_the_one_the_proxy_reports(self):
        for peer in ("172.18.0.5", "10.0.0.2", "192.168.1.9", "127.0.0.1", "::1"):
            with self.subTest(peer=peer):
                self.assertEqual(client_ip(request(peer, {"x-real-ip": "203.0.113.7"})), "203.0.113.7")

    def test_every_person_behind_the_proxy_is_told_apart(self):
        first = client_ip(request("172.18.0.5", {"x-real-ip": "203.0.113.7"}))
        second = client_ip(request("172.18.0.5", {"x-real-ip": "198.51.100.2"}))

        self.assertNotEqual(first, second)

    def test_a_request_straight_from_the_internet_cannot_pick_its_address_with_a_header(self):
        # (the documentation ranges 203.0.113.0/24 and 198.51.100.0/24 count as private, so real ones here)
        self.assertEqual(client_ip(request("8.8.8.8", {"x-real-ip": "1.1.1.1"})), "8.8.8.8")
        self.assertEqual(client_ip(request("93.184.216.34", {"x-real-ip": "10.0.0.1"})), "93.184.216.34")

    def test_the_forwarded_for_header_is_not_believed_at_all(self):
        self.assertEqual(client_ip(request("172.18.0.5", {"x-forwarded-for": "198.51.100.2"})), "172.18.0.5")

    def test_a_garbage_header_falls_back_to_the_peer(self):
        for value in ("", "not an ip", "1.2.3", "203.0.113.7, 10.0.0.1"):
            with self.subTest(value=value):
                self.assertEqual(client_ip(request("172.18.0.5", {"x-real-ip": value})), "172.18.0.5")

    def test_a_request_without_a_peer_is_unknown(self):
        self.assertEqual(client_ip(request(None)), "unknown")
        self.assertEqual(client_ip(request("testclient")), "testclient")


class PublicLimitsAreCountedPerPersonTests(unittest.IsolatedAsyncioTestCase):
    """The limit of public submissions is meant per person; behind the proxy it used to be per survey."""

    async def test_two_people_behind_the_proxy_have_separate_limits(self):
        seen = []
        patch.object(
            survey_routes, "check_public_suggest_limit", lambda key: seen.append(key) or True
        ).start()
        patch.object(
            survey_routes.survey_service, "submit_public_response", AsyncMock(return_value="ok")
        ).start()
        self.addCleanup(patch.stopall)

        for real in ("203.0.113.7", "198.51.100.2"):
            await survey_routes.submit_public_response(
                "tok", MagicMock(), MagicMock(), SimpleNamespace(
                    client=SimpleNamespace(host="172.18.0.5"),
                    headers={"x-real-ip": real, "user-agent": "ua"},
                ),
            )

        self.assertEqual(seen, ["survey-submit:tok:203.0.113.7", "survey-submit:tok:198.51.100.2"])


if __name__ == "__main__":
    unittest.main()
