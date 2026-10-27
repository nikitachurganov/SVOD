import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.name_utils import build_display_name
from app.core.security import (
    create_access_token,
    hash_password,
    is_pending_activation,
    verify_password,
)
from app.models.organization import OrganizationInvitation, OrganizationMember
from app.models.user import User
from app.models.user_onboarding import UserOnboarding
from app.repositories import (
    email_verification_repository,
    organization_repository,
    password_reset_repository,
    user_onboarding_repository,
    user_repository,
)
from app.schemas.auth import (
    AccountActivationInfo,
    ActivateAccountRequest,
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetConfirm,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
)
from app.schemas.user import UserProfileResponse
from app.services import avatar_service, email_service, onboarding_service

logger = logging.getLogger(__name__)


async def create_account(session: AsyncSession, payload: RegisterRequest) -> User:
    """Create an active account (no commit). Shared by sign-up and sign-up via a join link."""
    existing = await user_repository.get_by_email(session, payload.email)
    if existing and not is_pending_activation(existing.password_hash):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    if not payload.first_name or not payload.last_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="first_name and last_name are required",
        )

    if existing is not None:
        # An owner pre-created this account, but the person registered on their own instead of
        # using the activation link: take the account over. The organization invitation stays
        # pending and can be accepted from notifications.
        _apply_profile(
            existing,
            first_name=payload.first_name,
            last_name=payload.last_name,
            middle_name=payload.middle_name,
            phone_number=payload.phone_number,
        )
        existing.password_hash = hash_password(payload.password)
        existing.is_active = True
        await session.flush()
        return existing

    user = User(
        full_name=build_display_name(
            last_name=payload.last_name,
            first_name=payload.first_name,
            middle_name=payload.middle_name,
        ),
        first_name=payload.first_name,
        last_name=payload.last_name,
        middle_name=payload.middle_name,
        email=payload.email,
        phone_number=payload.phone_number,
        password_hash=hash_password(payload.password),
    )
    return await user_repository.create(session, user)


async def register(
    session: AsyncSession, payload: RegisterRequest
) -> tuple[TokenResponse, "EmailVerificationDelivery | None"]:
    """Sign up. The second value is the confirmation email to send once the response is out."""
    user = await create_account(session, payload)
    delivery = None
    if user.email_verified_at is None:
        delivery = await _issue_email_verification(session, user, payload.service)
    await session.commit()
    return TokenResponse(access_token=create_access_token(subject=str(user.id))), delivery


async def login(session: AsyncSession, payload: LoginRequest) -> TokenResponse:
    user = await user_repository.get_by_email(session, payload.email)
    if user and is_pending_activation(user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт ещё не активирован. Перейдите по ссылке из письма-приглашения.",
        )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    user.last_login_at = datetime.now(timezone.utc)
    await session.commit()
    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token)


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

_INVALID_RESET_LINK = "Ссылка недействительна или устарела. Запросите восстановление пароля заново."


@dataclass(frozen=True)
class PasswordResetDelivery:
    """Everything needed to email the link; the raw token is never stored."""

    email: str
    first_name: str
    url: str


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _app_base_url(service: str) -> str:
    if service == "surveys" and settings.SURVEYS_APP_PUBLIC_URL.strip():
        return settings.SURVEYS_APP_PUBLIC_URL.strip().rstrip("/")
    return settings.APP_PUBLIC_URL.strip().rstrip("/")


async def request_password_reset(
    session: AsyncSession, email: str, service: str
) -> PasswordResetDelivery | None:
    """Create a one-time link for the account. Returns None when nothing must be sent.

    The caller answers identically either way, so the endpoint does not reveal which emails are registered.
    """
    user = await user_repository.get_by_email(session, email.strip().lower())
    if user is None or not user.is_active or is_pending_activation(user.password_hash):
        return None

    now = datetime.now(timezone.utc)
    last_created = await password_reset_repository.latest_created_at(session, user.id)
    if last_created and now - last_created < timedelta(seconds=settings.PASSWORD_RESET_COOLDOWN_SECONDS):
        return None

    # Only the newest link works
    await password_reset_repository.invalidate_unused(session, user.id, now)
    token = secrets.token_urlsafe(32)
    await password_reset_repository.create(
        session,
        user_id=user.id,
        token_hash=_hash_reset_token(token),
        expires_at=now + timedelta(minutes=settings.PASSWORD_RESET_TTL_MINUTES),
    )
    await session.commit()

    return PasswordResetDelivery(
        email=user.email,
        first_name=user.first_name,
        url=f"{_app_base_url(service)}/reset-password/{token}",
    )


async def deliver_password_reset(delivery: PasswordResetDelivery) -> None:
    sent = await email_service.send_password_reset(
        to=delivery.email,
        first_name=delivery.first_name,
        reset_url=delivery.url,
        ttl_minutes=settings.PASSWORD_RESET_TTL_MINUTES,
    )
    if not sent and not email_service.is_configured():
        # Local development without SMTP: the developer takes the link from the server log
        logger.warning("SMTP is not configured; password reset link for %s: %s", delivery.email, delivery.url)


async def _load_reset_token(session: AsyncSession, token: str):
    row = await password_reset_repository.get_by_hash(session, _hash_reset_token(token))
    if row is None or row.used_at is not None or row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_INVALID_RESET_LINK)
    user = await user_repository.get_by_id(session, row.user_id)
    if user is None or not user.is_active or is_pending_activation(user.password_hash):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_INVALID_RESET_LINK)
    return row, user


async def check_password_reset_token(session: AsyncSession, token: str) -> None:
    await _load_reset_token(session, token)


async def confirm_password_reset(session: AsyncSession, token: str, payload: PasswordResetConfirm) -> None:
    row, user = await _load_reset_token(session, token)
    now = datetime.now(timezone.utc)
    user.password_hash = hash_password(payload.password)
    if user.email_verified_at is None:
        # The link came to the mailbox, so the person has proven they own it
        user.email_verified_at = now
    # The link is consumed together with any other outstanding ones
    await password_reset_repository.invalidate_unused(session, user.id, now)
    await session.commit()


# ---------------------------------------------------------------------------
# Email confirmation
# ---------------------------------------------------------------------------

_INVALID_VERIFICATION_LINK = "Ссылка недействительна или устарела. Запросите новое письмо в профиле."


@dataclass(frozen=True)
class EmailVerificationDelivery:
    """Everything needed to email the link; the raw token is never stored."""

    email: str
    first_name: str
    url: str


async def _issue_email_verification(
    session: AsyncSession, user: User, service: str
) -> EmailVerificationDelivery:
    """Create a one-time link, burning the earlier ones (no commit)."""
    now = datetime.now(timezone.utc)
    await email_verification_repository.invalidate_unused(session, user.id, now)
    token = secrets.token_urlsafe(32)
    await email_verification_repository.create(
        session,
        user_id=user.id,
        token_hash=_hash_reset_token(token),
        expires_at=now + timedelta(hours=settings.EMAIL_VERIFICATION_TTL_HOURS),
    )
    return EmailVerificationDelivery(
        email=user.email,
        first_name=user.first_name,
        url=f"{_app_base_url(service)}/verify-email/{token}",
    )


async def request_email_verification(
    session: AsyncSession, user: User, service: str
) -> EmailVerificationDelivery | None:
    """Resend the confirmation link to the signed-in person. None when there is nothing to send."""
    if user.email_verified_at is not None:
        return None

    now = datetime.now(timezone.utc)
    last_created = await email_verification_repository.latest_created_at(session, user.id)
    if last_created and now - last_created < timedelta(seconds=settings.EMAIL_VERIFICATION_COOLDOWN_SECONDS):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Письмо уже отправлено. Повторить можно через минуту.",
        )

    delivery = await _issue_email_verification(session, user, service)
    await session.commit()
    return delivery


async def deliver_email_verification(delivery: EmailVerificationDelivery) -> None:
    sent = await email_service.send_email_verification(
        to=delivery.email,
        first_name=delivery.first_name,
        verify_url=delivery.url,
        ttl_hours=settings.EMAIL_VERIFICATION_TTL_HOURS,
    )
    if not sent and not email_service.is_configured():
        # Local development without SMTP: the developer takes the link from the server log
        logger.warning("SMTP is not configured; email confirmation link for %s: %s", delivery.email, delivery.url)


async def confirm_email_verification(session: AsyncSession, token: str) -> None:
    row = await email_verification_repository.get_by_hash(session, _hash_reset_token(token))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_INVALID_VERIFICATION_LINK)
    user = await user_repository.get_by_id(session, row.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_INVALID_VERIFICATION_LINK)
    if user.email_verified_at is not None:
        # Already confirmed (the link was opened twice, or the mailbox was proven another way)
        return

    now = datetime.now(timezone.utc)
    if row.used_at is not None or row.expires_at < now:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_INVALID_VERIFICATION_LINK)

    user.email_verified_at = now
    await email_verification_repository.invalidate_unused(session, user.id, now)
    await session.commit()


def build_profile_response(
    user: User, onboarding: UserOnboarding | None, avatar_url: str | None = None
) -> UserProfileResponse:
    """`avatar_url` is the signed link to show, not the stored `user.avatar_url`."""
    display_name = build_display_name(
        last_name=user.last_name,
        first_name=user.first_name,
        middle_name=user.middle_name,
    )
    return UserProfileResponse(
        id=str(user.id),
        firstName=user.first_name,
        lastName=user.last_name,
        middleName=user.middle_name,
        fullName=display_name,
        email=user.email,
        phoneNumber=user.phone_number,
        avatarUrl=avatar_url,
        createdAt=user.created_at.isoformat(),
        role=user.role,
        emailVerified=user.email_verified_at is not None,
        emailVerificationAvailable=email_service.is_configured(),
        onboarding=onboarding_service.build_state(onboarding),
    )


async def get_profile(session: AsyncSession, user: User) -> UserProfileResponse:
    return build_profile_response(
        user,
        await user_onboarding_repository.get(session, user.id),
        await avatar_service.resolve_url(user.avatar_url),
    )


async def update_profile(
    session: AsyncSession, user: User, payload: UpdateProfileRequest
) -> UserProfileResponse:
    """Changes the person's own name; phone and email stay as they are."""
    _apply_profile(
        user,
        first_name=payload.first_name,
        last_name=payload.last_name,
        middle_name=payload.middle_name,
        phone_number=user.phone_number,
    )
    await session.commit()
    return await get_profile(session, user)


# A wrong «current password» answers 400, not 401: the web client treats 401 as an expired session
_WRONG_CURRENT_PASSWORD = "Текущий пароль указан неверно"
_SAME_PASSWORD = "Новый пароль должен отличаться от текущего"
_TOO_MANY_PASSWORD_ATTEMPTS = "Слишком много неверных попыток. Попробуйте позже."

_PASSWORD_ATTEMPT_WINDOW = timedelta(minutes=15)
_MAX_PASSWORD_ATTEMPTS = 5
# Best-effort and process-local, like the other limits: it only slows guessing with a stolen token
_failed_password_attempts: dict[uuid.UUID, list[datetime]] = {}


def _recent_failed_attempts(user_id: uuid.UUID, now: datetime) -> list[datetime]:
    recent = [t for t in _failed_password_attempts.get(user_id, []) if now - t < _PASSWORD_ATTEMPT_WINDOW]
    if recent:
        _failed_password_attempts[user_id] = recent
    else:
        _failed_password_attempts.pop(user_id, None)
    return recent


def check_current_password(user: User, password: str) -> None:
    """Re-ask for the password before a sensitive action; wrong guesses are counted and limited."""
    now = datetime.now(timezone.utc)
    attempts = _recent_failed_attempts(user.id, now)
    if len(attempts) >= _MAX_PASSWORD_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=_TOO_MANY_PASSWORD_ATTEMPTS)

    if not verify_password(password, user.password_hash):
        _failed_password_attempts[user.id] = [*attempts, now]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_WRONG_CURRENT_PASSWORD)
    _failed_password_attempts.pop(user.id, None)


async def change_password(session: AsyncSession, user: User, payload: ChangePasswordRequest) -> None:
    now = datetime.now(timezone.utc)
    check_current_password(user, payload.current_password)
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_SAME_PASSWORD)

    user.password_hash = hash_password(payload.new_password)
    # Reset links issued earlier must not outlive the password they were meant to replace
    await password_reset_repository.invalidate_unused(session, user.id, now)
    await session.commit()


# ---------------------------------------------------------------------------
# Account activation (accounts pre-created by an organization owner)
# ---------------------------------------------------------------------------

_INVALID_LINK = "Ссылка недействительна: возможно, приглашение отозвано или уже использовано"


def _apply_profile(
    user: User,
    *,
    first_name: str | None,
    last_name: str | None,
    middle_name: str | None,
    phone_number: str | None,
) -> None:
    user.first_name = first_name or user.first_name
    user.last_name = last_name or user.last_name
    user.middle_name = middle_name
    user.phone_number = phone_number or ""
    user.full_name = build_display_name(
        last_name=user.last_name, first_name=user.first_name, middle_name=user.middle_name
    )


async def _load_account_invitation(
    session: AsyncSession, token: str
) -> tuple[OrganizationInvitation, User]:
    inv = await organization_repository.get_invitation_by_code(session, token)
    if inv is None or inv.kind != "new_account" or inv.status != "pending" or inv.invited_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_INVALID_LINK)
    if inv.expires_at and inv.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Срок действия ссылки истёк. Попросите владельца организации отправить приглашение повторно.",
        )
    user = inv.invited_user
    if not is_pending_activation(user.password_hash):
        # Already activated (e.g. registered on their own): the link can no longer set a password
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Аккаунт уже активирован. Войдите со своим паролем и примите приглашение в уведомлениях.",
        )
    return inv, user


async def get_activation_info(session: AsyncSession, token: str) -> AccountActivationInfo:
    inv, user = await _load_account_invitation(session, token)
    inviter = inv.invited_by
    return AccountActivationInfo(
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        middle_name=user.middle_name,
        phone_number=user.phone_number,
        organization_name=inv.organization.name if inv.organization else "",
        inviter_name=build_display_name(
            last_name=inviter.last_name, first_name=inviter.first_name, middle_name=inviter.middle_name
        )
        if inviter
        else None,
        job_title=inv.job_title,
        expires_at=inv.expires_at.isoformat() if inv.expires_at else None,
    )


async def activate_account(
    session: AsyncSession, token: str, payload: ActivateAccountRequest
) -> TokenResponse:
    """Confirm a pre-created account: set the password, activate, join the organization, log in."""
    inv, user = await _load_account_invitation(session, token)

    _apply_profile(
        user,
        first_name=payload.first_name,
        last_name=payload.last_name,
        middle_name=payload.middle_name,
        phone_number=payload.phone_number,
    )
    user.password_hash = hash_password(payload.password)
    user.is_active = True
    if user.email_verified_at is None:
        # The activation link was sent to this mailbox
        user.email_verified_at = datetime.now(timezone.utc)

    if await organization_repository.get_member(session, inv.organization_id, user.id) is None:
        session.add(
            OrganizationMember(
                organization_id=inv.organization_id,
                user_id=user.id,
                role_tag=inv.role_tag or "member",
                job_title=inv.job_title,
                specialization=inv.specialization,
            )
        )
    inv.status = "accepted"
    await session.commit()

    return TokenResponse(access_token=create_access_token(subject=str(user.id)))
