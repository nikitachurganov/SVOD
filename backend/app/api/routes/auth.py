from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import (
    AccountActivationInfo,
    ActivateAccountRequest,
    LoginRequest,
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


@router.get("/me", response_model=UserProfileResponse)
async def me(user: CurrentUser) -> UserProfileResponse:
    return auth_service.build_profile_response(user)
