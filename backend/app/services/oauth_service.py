"""Sign-in and sign-up through Yandex ID.

The browser goes to ``/auth/oauth/<provider>/start``, which sets a short-lived signed cookie (the state
and the PKCE verifier) and sends it to the provider. The provider returns to
``/auth/oauth/<provider>/callback``; the cookie must match the ``state`` that came back, so a link made
by someone else cannot sign a person into the attacker's account. The result goes back to the web app
as a redirect: the token in the URL fragment (never sent to a server or written to a log), or an
error code in ``?oauth_error=``.

An account is found by the provider's own id. If there is none yet, the provider's mailbox is matched to
an existing account (Yandex only reports mailboxes it has confirmed), and otherwise a new
account is created, without a password.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.name_utils import build_display_name, normalize_name_part
from app.core.security import ALGORITHM, NO_PASSWORD_HASH, create_access_token, is_pending_activation
from app.models.user import User
from app.repositories import user_identity_repository, user_repository
from app.services import oauth_client
from app.services.oauth_client import OAuthProfile, OAuthProviderError

logger = logging.getLogger(__name__)

STATE_COOKIE = "svod_oauth_state"
_STATE_PURPOSE = "oauth_state"

# Shown in place of a name the provider did not give: both name fields are required
_FALLBACK_FIRST_NAME = "Пользователь"
_FALLBACK_LAST_NAME = "—"

# What the sign-in page is told (?oauth_error=...)
ERROR_DENIED = "denied"
ERROR_FAILED = "failed"
ERROR_EXPIRED = "expired"
ERROR_NO_EMAIL = "no_email"
ERROR_INACTIVE = "inactive"


class OAuthFlowError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class OAuthStart:
    url: str
    cookie_value: str


@dataclass(frozen=True)
class OAuthState:
    service: str
    verifier: str


def app_base_url(service: str) -> str:
    """Where the web app of the service lives (the person is sent back here)."""
    if service == "surveys" and settings.SURVEYS_APP_PUBLIC_URL.strip():
        return settings.SURVEYS_APP_PUBLIC_URL.strip().rstrip("/")
    return settings.APP_PUBLIC_URL.strip().rstrip("/")


def redirect_uri(provider: str, service: str) -> str:
    configured = settings.OAUTH_REDIRECT_BASE_URL.strip().rstrip("/")
    base = configured or f"{app_base_url(service)}/api"
    return f"{base}/auth/oauth/{provider}/callback"


def begin(provider: str, service: str) -> OAuthStart:
    if not oauth_client.is_enabled(provider):
        raise OAuthFlowError(ERROR_FAILED)
    nonce = secrets.token_urlsafe(24)
    verifier = oauth_client.new_code_verifier()
    cookie = jwt.encode(
        {
            "purpose": _STATE_PURPOSE,
            "provider": provider,
            "service": service,
            "nonce": nonce,
            "verifier": verifier,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.OAUTH_STATE_TTL_MINUTES),
        },
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )
    url = oauth_client.authorize_url(
        provider,
        redirect_uri=redirect_uri(provider, service),
        state=nonce,
        code_verifier=verifier,
    )
    return OAuthStart(url=url, cookie_value=cookie)


def read_state(cookie_value: str | None, provider: str, state: str | None) -> OAuthState:
    """The cookie set at the start must belong to this provider and carry the returned state."""
    if not cookie_value or not state:
        raise OAuthFlowError(ERROR_EXPIRED)
    try:
        payload = jwt.decode(cookie_value, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise OAuthFlowError(ERROR_EXPIRED) from None
    if (
        payload.get("purpose") != _STATE_PURPOSE
        or payload.get("provider") != provider
        or not secrets.compare_digest(str(payload.get("nonce", "")), state)
    ):
        raise OAuthFlowError(ERROR_EXPIRED)
    return OAuthState(service=str(payload.get("service") or "platform"), verifier=str(payload["verifier"]))


async def complete(
    session: AsyncSession,
    provider: str,
    *,
    state: OAuthState,
    state_value: str,
    code: str,
) -> str:
    """Finish the sign-in and return the access token of the web app."""
    if not oauth_client.is_enabled(provider):
        raise OAuthFlowError(ERROR_FAILED)
    try:
        profile = await oauth_client.fetch_profile(
            provider,
            code=code,
            redirect_uri=redirect_uri(provider, state.service),
            state=state_value,
            code_verifier=state.verifier,
        )
    except OAuthProviderError:
        raise OAuthFlowError(ERROR_FAILED) from None

    user = await resolve_user(session, profile)
    user.last_login_at = datetime.now(timezone.utc)
    await session.commit()
    return create_access_token(subject=str(user.id))


async def resolve_user(session: AsyncSession, profile: OAuthProfile) -> User:
    """The account of this provider identity: known, matched by mailbox, or new (no commit)."""
    identity = await user_identity_repository.get(session, profile.provider, profile.provider_user_id)
    if identity is not None:
        user = await user_repository.get_by_id(session, identity.user_id)
        if user is None or not user.is_active:
            raise OAuthFlowError(ERROR_INACTIVE)
        return user

    if not profile.email:
        raise OAuthFlowError(ERROR_NO_EMAIL)

    user = await user_repository.get_by_email(session, profile.email)
    if user is not None:
        if not user.is_active:
            raise OAuthFlowError(ERROR_INACTIVE)
        if is_pending_activation(user.password_hash):
            # An owner pre-created this account and the person came in on their own instead of the
            # activation link: they take it over, as when signing up with a password. The
            # organization invitation stays pending and can be accepted from the notifications.
            user.password_hash = NO_PASSWORD_HASH
    else:
        first_name = (normalize_name_part(profile.first_name) or _FALLBACK_FIRST_NAME)[:100]
        last_name = (normalize_name_part(profile.last_name) or _FALLBACK_LAST_NAME)[:100]
        user = await user_repository.create(
            session,
            User(
                full_name=build_display_name(last_name=last_name, first_name=first_name),
                first_name=first_name,
                last_name=last_name,
                email=profile.email,
                phone_number="",
                password_hash=NO_PASSWORD_HASH,
            ),
        )

    if user.email_verified_at is None:
        # The provider vouched for the mailbox
        user.email_verified_at = datetime.now(timezone.utc)
    await user_identity_repository.create(
        session,
        user_id=user.id,
        provider=profile.provider,
        provider_user_id=profile.provider_user_id,
        email=profile.email,
    )
    return user
