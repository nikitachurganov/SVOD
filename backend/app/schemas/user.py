from datetime import datetime

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: str
    first_name: str
    last_name: str
    middle_name: str | None
    full_name: str
    email: str
    phone_number: str
    avatar_url: str | None
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OnboardingState(BaseModel):
    """First-visit questionnaire and tour state, as the web client reads it."""
    surveyCompleted: bool
    # Show the questionnaire now: not answered yet and not closed
    needsSurvey: bool
    # May be closed without answering (accounts that predate the questionnaire)
    dismissible: bool
    tourStatus: str
    tourStep: str | None


class UserProfileResponse(BaseModel):
    """Matches the frontend UserProfile interface."""
    id: str
    firstName: str
    lastName: str
    middleName: str | None
    fullName: str
    email: str
    phoneNumber: str
    avatarUrl: str | None
    createdAt: str
    # Platform role: "user" or "admin"
    role: str
    # The mailbox was confirmed by a link from an email
    emailVerified: bool
    # The server can send the confirmation email (SMTP is set up); without it nobody is asked to confirm
    emailVerificationAvailable: bool
    onboarding: OnboardingState


class PublicAuthorResponse(BaseModel):
    id: str
    first_name: str
    last_name: str
    middle_name: str | None
    email: str
