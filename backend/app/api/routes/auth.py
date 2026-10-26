from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Response
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import (
    AccountActivationInfo,
    ActivateAccountRequest,
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
)
from app.schemas.onboarding import OnboardingSurveyRequest, TourUpdateRequest
from app.schemas.user import OnboardingState, UserProfileResponse
from app.services import auth_service, onboarding_service

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
async def me(user: CurrentUser, session: DbSession) -> UserProfileResponse:
    return await auth_service.get_profile(session, user)


@router.patch("/me", response_model=UserProfileResponse)
async def update_me(
    payload: UpdateProfileRequest, user: CurrentUser, session: DbSession
) -> UserProfileResponse:
    """Change the signed-in person's first, last and middle name."""
    return await auth_service.update_profile(session, user, payload)


@router.put("/me/onboarding", response_model=OnboardingState)
async def submit_onboarding_survey(
    payload: OnboardingSurveyRequest, user: CurrentUser, session: DbSession
) -> OnboardingState:
    """Save the answers of the first-visit questionnaire (who, what for, where from)."""
    return await onboarding_service.submit_survey(session, user, payload)


@router.post("/me/onboarding/dismiss", response_model=OnboardingState)
async def dismiss_onboarding_survey(user: CurrentUser, session: DbSession) -> OnboardingState:
    """Close the questionnaire without answering; only for accounts that predate it (403 otherwise)."""
    return await onboarding_service.dismiss_survey(session, user)


@router.patch("/me/tour", response_model=OnboardingState)
async def update_tour(
    payload: TourUpdateRequest, user: CurrentUser, session: DbSession
) -> OnboardingState:
    """Remember the answer to the tour offer and how far the person got."""
    return await onboarding_service.update_tour(session, user, payload)


@router.post("/me/password", status_code=204)
async def change_my_password(
    payload: ChangePasswordRequest, user: CurrentUser, session: DbSession
) -> Response:
    """Change the password of the signed-in person (the current one is required)."""
    await auth_service.change_password(session, user, payload)
    return Response(status_code=204)
