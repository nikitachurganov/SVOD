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
from app.repositories import organization_repository, password_reset_repository, user_repository
from app.schemas.auth import (
    AccountActivationInfo,
    ActivateAccountRequest,
    LoginRequest,
    PasswordResetConfirm,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import UserProfileResponse
from app.services import email_service

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


async def register(session: AsyncSession, payload: RegisterRequest) -> TokenResponse:
    user = await create_account(session, payload)
    await session.commit()
    return TokenResponse(access_token=create_access_token(subject=str(user.id)))


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
    user.password_hash = hash_password(payload.password)
    # The link is consumed together with any other outstanding ones
    await password_reset_repository.invalidate_unused(session, user.id, datetime.now(timezone.utc))
    await session.commit()


def build_profile_response(user: User) -> UserProfileResponse:
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
        avatarUrl=user.avatar_url,
        createdAt=user.created_at.isoformat(),
    )


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
