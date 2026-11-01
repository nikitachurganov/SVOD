from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

from jose import jwt

from app.core.config import settings
from app.core.security import ALGORITHM, NO_PASSWORD_HASH, PENDING_ACTIVATION_HASH, hash_password, verify_password
from app.services import oauth_client, oauth_service
from app.services.oauth_client import OAuthProfile


def profile(**overrides) -> OAuthProfile:
    data = dict(
        provider="yandex",
        provider_user_id="1000",
        email="anna@yandex.ru",
        first_name="Анна",
        last_name="Иванова",
    )
    data.update(overrides)
    return OAuthProfile(**data)


def existing_user(**overrides):
    data = dict(
        id=uuid.uuid4(),
        email="anna@yandex.ru",
        password_hash=hash_password("OldPassword1"),
        is_active=True,
        email_verified_at=None,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


class ProvidersConfigTests(unittest.TestCase):
    def test_provider_is_offered_only_when_configured(self):
        with patch.multiple(
            settings,
            OAUTH_YANDEX_CLIENT_ID="", OAUTH_YANDEX_CLIENT_SECRET=""
        ):
            self.assertEqual(settings.oauth_providers, [])
        with patch.multiple(
            settings, OAUTH_YANDEX_CLIENT_ID="id", OAUTH_YANDEX_CLIENT_SECRET=""
        ):
            # Yandex needs the secret too
            self.assertEqual(settings.oauth_providers, [])
        with patch.multiple(settings, OAUTH_YANDEX_CLIENT_ID="id", OAUTH_YANDEX_CLIENT_SECRET="secret"):
            self.assertEqual(settings.oauth_providers, ["yandex"])


class StateTests(unittest.TestCase):
    def setUp(self):
        patcher = patch.multiple(
            settings,
            OAUTH_YANDEX_CLIENT_ID="ya-id",
            OAUTH_YANDEX_CLIENT_SECRET="ya-secret",
            OAUTH_REDIRECT_BASE_URL="https://svod.example/api",
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_yandex_start_builds_the_consent_url(self):
        start = oauth_service.begin("yandex", "platform")
        url = urlparse(start.url)
        query = parse_qs(url.query)
        self.assertEqual(f"{url.scheme}://{url.netloc}{url.path}", "https://oauth.yandex.ru/authorize")
        self.assertEqual(query["client_id"], ["ya-id"])
        self.assertEqual(query["redirect_uri"], ["https://svod.example/api/auth/oauth/yandex/callback"])
        self.assertNotIn("code_challenge", query)

    def test_not_configured_provider_cannot_start(self):
        with patch.multiple(settings, OAUTH_YANDEX_CLIENT_ID=""):
            with self.assertRaises(oauth_service.OAuthFlowError):
                oauth_service.begin("yandex", "platform")

    def test_returned_state_must_match_the_cookie(self):
        start = oauth_service.begin("yandex", "surveys")
        nonce = parse_qs(urlparse(start.url).query)["state"][0]

        state = oauth_service.read_state(start.cookie_value, "yandex", nonce)
        self.assertEqual(state.service, "surveys")

        for cookie, provider, returned in (
            (start.cookie_value, "yandex", "someone-elses-state"),
            (start.cookie_value, "other", nonce),
            (None, "yandex", nonce),
            (start.cookie_value, "yandex", None),
            ("garbage", "yandex", nonce),
        ):
            with self.assertRaises(oauth_service.OAuthFlowError) as ctx:
                oauth_service.read_state(cookie, provider, returned)
            self.assertEqual(ctx.exception.code, oauth_service.ERROR_EXPIRED)

    def test_expired_cookie_is_refused(self):
        start = oauth_service.begin("yandex", "platform")
        nonce = parse_qs(urlparse(start.url).query)["state"][0]
        payload = jwt.decode(start.cookie_value, settings.SECRET_KEY, algorithms=[ALGORITHM])
        payload["exp"] = datetime.now(timezone.utc) - timedelta(minutes=1)
        expired = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
        with self.assertRaises(oauth_service.OAuthFlowError):
            oauth_service.read_state(expired, "yandex", nonce)

    def test_an_access_token_is_not_a_state_cookie(self):
        from app.core.security import create_access_token

        with self.assertRaises(oauth_service.OAuthFlowError):
            oauth_service.read_state(create_access_token("user-id"), "yandex", "x")


class ResolveUserTests(unittest.IsolatedAsyncioTestCase):
    def _patches(self, *, identity=None, by_email=None, by_id=None):
        return (
            patch.object(oauth_service.user_identity_repository, "get", AsyncMock(return_value=identity)),
            patch.object(oauth_service.user_identity_repository, "create", AsyncMock()),
            patch.object(oauth_service.user_repository, "get_by_email", AsyncMock(return_value=by_email)),
            patch.object(oauth_service.user_repository, "get_by_id", AsyncMock(return_value=by_id)),
            patch.object(
                oauth_service.user_repository, "create", AsyncMock(side_effect=lambda _s, user: user)
            ),
        )

    async def test_known_identity_signs_in_its_account(self):
        user = existing_user()
        get, create_identity, by_email, by_id, create_user = self._patches(
            identity=SimpleNamespace(user_id=user.id), by_id=user
        )
        with get, create_identity as created, by_email, by_id, create_user as new_user:
            result = await oauth_service.resolve_user(MagicMock(), profile())
        self.assertIs(result, user)
        created.assert_not_awaited()
        new_user.assert_not_awaited()

    async def test_deactivated_account_is_refused(self):
        user = existing_user(is_active=False)
        get, create_identity, by_email, by_id, create_user = self._patches(
            identity=SimpleNamespace(user_id=user.id), by_id=user
        )
        with get, create_identity, by_email, by_id, create_user:
            with self.assertRaises(oauth_service.OAuthFlowError) as ctx:
                await oauth_service.resolve_user(MagicMock(), profile())
        self.assertEqual(ctx.exception.code, oauth_service.ERROR_INACTIVE)

    async def test_mailbox_of_an_existing_account_links_the_identity(self):
        user = existing_user()
        get, create_identity, by_email, by_id, create_user = self._patches(by_email=user)
        with get, create_identity as created, by_email, by_id, create_user as new_user:
            result = await oauth_service.resolve_user(MagicMock(), profile())
        self.assertIs(result, user)
        new_user.assert_not_awaited()
        created.assert_awaited_once()
        self.assertIsNotNone(user.email_verified_at)
        # Their password keeps working
        self.assertTrue(verify_password("OldPassword1", user.password_hash))

    async def test_precreated_account_is_taken_over_without_a_password(self):
        user = existing_user(password_hash=PENDING_ACTIVATION_HASH)
        get, create_identity, by_email, by_id, create_user = self._patches(by_email=user)
        with get, create_identity, by_email, by_id, create_user:
            await oauth_service.resolve_user(MagicMock(), profile())
        self.assertEqual(user.password_hash, NO_PASSWORD_HASH)

    async def test_new_person_gets_an_account_without_a_password(self):
        get, create_identity, by_email, by_id, create_user = self._patches()
        with get, create_identity as created, by_email, by_id, create_user as new_user:
            user = await oauth_service.resolve_user(MagicMock(), profile())
        new_user.assert_awaited_once()
        created.assert_awaited_once()
        self.assertEqual(user.email, "anna@yandex.ru")
        self.assertEqual((user.first_name, user.last_name), ("Анна", "Иванова"))
        self.assertEqual(user.full_name, "Иванова Анна")
        self.assertIsNotNone(user.email_verified_at)
        self.assertFalse(verify_password("", user.password_hash))
        self.assertFalse(verify_password(user.password_hash, user.password_hash))

    async def test_missing_names_get_a_placeholder(self):
        get, create_identity, by_email, by_id, create_user = self._patches()
        with get, create_identity, by_email, by_id, create_user:
            user = await oauth_service.resolve_user(MagicMock(), profile(first_name="", last_name=""))
        self.assertTrue(user.first_name and user.last_name)

    async def test_no_mailbox_and_no_identity_is_refused(self):
        get, create_identity, by_email, by_id, create_user = self._patches()
        with get, create_identity, by_email, by_id, create_user as new_user:
            with self.assertRaises(oauth_service.OAuthFlowError) as ctx:
                await oauth_service.resolve_user(MagicMock(), profile(email=None))
        self.assertEqual(ctx.exception.code, oauth_service.ERROR_NO_EMAIL)
        new_user.assert_not_awaited()

    async def test_provider_failure_becomes_a_flow_error(self):
        state = oauth_service.OAuthState(service="platform", verifier="v")
        with patch.multiple(
            settings, OAUTH_YANDEX_CLIENT_ID="ya-id", OAUTH_YANDEX_CLIENT_SECRET="ya-secret"
        ), patch.object(
            oauth_client,
            "fetch_profile",
            AsyncMock(side_effect=oauth_client.OAuthProviderError("boom")),
        ):
            with self.assertRaises(oauth_service.OAuthFlowError) as ctx:
                await oauth_service.complete(
                    MagicMock(), "yandex", state=state, state_value="s", code="c"
                )
        self.assertEqual(ctx.exception.code, oauth_service.ERROR_FAILED)


if __name__ == "__main__":
    unittest.main()
