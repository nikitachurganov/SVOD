from pydantic import BaseModel, Field, field_validator

from app.schemas.auth import RegisterRequest
from app.schemas.user import PublicAuthorResponse


def _strip_or_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


class JoinProfileFields(BaseModel):
    """What the applicant tells the owner about themselves."""
    job_title: str | None = Field(None, max_length=300)
    specialization: str | None = Field(None, max_length=2000)
    message: str | None = Field(None, max_length=2000)

    @field_validator("job_title", "specialization", "message", mode="before")
    @classmethod
    def strip_blank(cls, value: str | None) -> str | None:
        return _strip_or_none(value)


class JoinApplyRequest(JoinProfileFields):
    """Signed-in user applies to join."""


class JoinRegisterRequest(RegisterRequest):
    """New person signs up on the join page and applies in one step."""
    job_title: str | None = Field(None, max_length=300)
    specialization: str | None = Field(None, max_length=2000)
    message: str | None = Field(None, max_length=2000)

    @field_validator("job_title", "specialization", "message", mode="before")
    @classmethod
    def strip_blank_profile(cls, value: str | None) -> str | None:
        return _strip_or_none(value)


class JoinLinkResponse(BaseModel):
    enabled: bool
    token: str | None
    url: str | None


class UpdateJoinLinkRequest(BaseModel):
    enabled: bool


class JoinPageInfo(BaseModel):
    """Public data for the join page."""
    organization_id: str
    organization_name: str
    organization_description: str | None
    members_count: int


class JoinRequestResponse(BaseModel):
    id: str
    organization_id: str
    organization_name: str
    user: PublicAuthorResponse | None
    phone_number: str | None = None
    status: str
    job_title: str | None
    specialization: str | None
    message: str | None
    reject_reason: str | None
    created_at: str
    decided_at: str | None


class JoinRegisterResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    request: JoinRequestResponse


class ApproveJoinRequest(BaseModel):
    job_title: str | None = Field(None, max_length=300)
    specialization: str | None = Field(None, max_length=2000)

    @field_validator("job_title", "specialization", mode="before")
    @classmethod
    def strip_blank(cls, value: str | None) -> str | None:
        return _strip_or_none(value)


class RejectJoinRequest(BaseModel):
    reason: str | None = Field(None, max_length=2000)

    @field_validator("reason", mode="before")
    @classmethod
    def strip_blank(cls, value: str | None) -> str | None:
        return _strip_or_none(value)


class InviteeLookupResponse(BaseModel):
    """For the manual-add form: is there an account with this email already?"""
    exists: bool
    full_name: str | None = None
    is_member: bool = False
    has_pending_invitation: bool = False
