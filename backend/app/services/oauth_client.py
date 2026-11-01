"""The HTTP side of sign-in through Yandex ID (authorization code flow).

Yandex: https://yandex.ru/dev/id/doc/ru/codes/code-url and .../user-information.

Every failure of the provider becomes ``OAuthProviderError``; the caller shows the person one generic
message and the cause goes to the log.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 15.0

YANDEX = "yandex"
PROVIDERS = (YANDEX,)

_YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize"
_YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token"
_YANDEX_INFO_URL = "https://login.yandex.ru/info"


class OAuthProviderError(Exception):
    pass


@dataclass(frozen=True)
class OAuthProfile:
    provider: str
    provider_user_id: str
    # The mailbox the provider vouches for; None when the person did not share one
    email: str | None
    first_name: str
    last_name: str


def is_enabled(provider: str) -> bool:
    return provider in settings.oauth_providers


def new_code_verifier() -> str:
    """PKCE verifier: 43-128 characters of the URL-safe alphabet."""
    return secrets.token_urlsafe(48)


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def authorize_url(provider: str, *, redirect_uri: str, state: str, code_verifier: str) -> str:
    query = {
        "response_type": "code",
        "client_id": settings.OAUTH_YANDEX_CLIENT_ID.strip(),
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": "login:info login:email",
    }
    return f"{_YANDEX_AUTHORIZE_URL}?{urlencode(query)}"


def _json(response: httpx.Response, what: str) -> dict:
    try:
        data = response.json()
    except ValueError:
        data = None
    if response.status_code >= 400 or not isinstance(data, dict) or data.get("error"):
        logger.warning("%s answered %s: %s", what, response.status_code, response.text[:300])
        raise OAuthProviderError(what)
    return data


async def fetch_profile(
    provider: str,
    *,
    code: str,
    redirect_uri: str,
    state: str,
    code_verifier: str,
) -> OAuthProfile:
    """Trade the code for a token and read who the person is."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            return await _yandex_profile(client, code)
    except httpx.HTTPError as exc:
        logger.warning("%s could not be reached: %s", provider, exc)
        raise OAuthProviderError("unreachable") from exc


async def _yandex_profile(client: httpx.AsyncClient, code: str) -> OAuthProfile:
    token = _json(
        await client.post(
            _YANDEX_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.OAUTH_YANDEX_CLIENT_ID.strip(),
                "client_secret": settings.OAUTH_YANDEX_CLIENT_SECRET.strip(),
            },
        ),
        "Yandex token",
    )
    access_token = token.get("access_token")
    if not access_token:
        raise OAuthProviderError("Yandex token without access_token")

    info = _json(
        await client.get(
            _YANDEX_INFO_URL,
            params={"format": "json"},
            headers={"Authorization": f"OAuth {access_token}"},
        ),
        "Yandex info",
    )
    user_id = str(info.get("id") or "").strip()
    if not user_id:
        raise OAuthProviderError("Yandex info without id")
    return OAuthProfile(
        provider=YANDEX,
        provider_user_id=user_id,
        email=_clean_email(info.get("default_email")),
        first_name=str(info.get("first_name") or "").strip(),
        last_name=str(info.get("last_name") or "").strip(),
    )


def _clean_email(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    email = value.strip().lower()
    return email if "@" in email and len(email) <= 320 else None
