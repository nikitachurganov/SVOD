from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Response
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import (
    AccountActivationInfo,
    ActivateAccountRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import UserProfileResponse
from app.services import auth_service

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(payload: RegisterRequest, session: DbSession) -> TokenResponse:
    return await auth_service.register(session, payload)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: DbSession) -> TokenResponse:
    return await auth_service.login(session, payload)


@router.post("/token", response_model=TokenResponse)
async def token_login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: DbSession,
) -> TokenResponse:
    payload = LoginRequest(email=form_data.username, password=form_data.password)
    return await auth_service.login(session, payload)


@router.get("/activation/{token}", response_model=AccountActivationInfo)
async def get_activation(token: str, session: DbSession) -> AccountActivationInfo:
    """Public: data of an account pre-created by an organization owner (token from the email)."""
    return await auth_service.get_activation_info(session, token)


@router.post("/activation/{token}", response_model=TokenResponse)
async def activate_account(
    token: str, payload: ActivateAccountRequest, session: DbSession
) -> TokenResponse:
    """Public: confirm the account, set a password and log in."""
    return await auth_service.activate_account(session, token, payload)


@router.post("/password-reset", status_code=204)
async def request_password_reset(
    payload: PasswordResetRequest, session: DbSession, background_tasks: BackgroundTasks
) -> Response:
    """Public: email a one-time link for setting a new password.

    Always answers 204, whether or not the email is registered. The email is sent after the response,
    so the response time does not give the answer away either.
    """
    delivery = await auth_service.request_password_reset(session, payload.email, payload.service)
    if delivery is not None:
        background_tasks.add_task(auth_service.deliver_password_reset, delivery)
    return Response(status_code=204)


@router.get("/password-reset/{token}", status_code=204)
async def check_password_reset(token: str, session: DbSession) -> Response:
    """Public: is the link still valid (so the page can say so before asking for a password)."""
    await auth_service.check_password_reset_token(session, token)
    return Response(status_code=204)


@router.post("/password-reset/{token}", status_code=204)
async def confirm_password_reset(
    token: str, payload: PasswordResetConfirm, session: DbSession
) -> Response:
    """Public: set a new password by the link from the email."""
    await auth_service.confirm_password_reset(session, token, payload)
    return Response(status_code=204)


@router.get("/me", response_model=UserProfileResponse)
async def me(user: CurrentUser) -> UserProfileResponse:
    return auth_service.build_profile_response(user)
