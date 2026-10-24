from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user import PublicAuthorResponse


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------

class CreateOrganizationRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class UpdateOrganizationRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class OrganizationResponse(BaseModel):
    id: str
    name: str
    description: str | None
    owner_user_id: str
    owner: PublicAuthorResponse | None = None
    members_count: int = 0
    is_personal: bool = False
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

class MemberResponse(BaseModel):
    id: str
    user: PublicAuthorResponse
    role_tag: str
    joined_at: str
    job_title: str | None = None
    specialization: str | None = None


class UpdateRoleRequest(BaseModel):
    role_tag: str = Field(..., min_length=1, max_length=50)


class TransferOwnershipRequest(BaseModel):
    new_owner_user_id: str = Field(..., min_length=1, max_length=64)


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

class CreateInvitationRequest(BaseModel):
    """Owner adds a person by email. Role is always 'member'.

    A registered user gets an in-app invitation; for an unknown email an inactive account is
    created from the fields below and the person activates it by the emailed link.
    """
    email: EmailStr
    first_name: str | None = Field(None, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    middle_name: str | None = Field(None, max_length=100)
    phone_number: str | None = Field(None, max_length=20)
    job_title: str | None = Field(None, max_length=300)
    specialization: str | None = Field(None, max_length=2000)

    @field_validator("first_name", "last_name", "middle_name", "phone_number", "job_title", "specialization", mode="before")
    @classmethod
    def strip_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = str(value).strip()
        return value or None


class InvitationResponse(BaseModel):
    id: str
    organization_id: str
    email: str
    invited_by: PublicAuthorResponse | None = None
    role_tag: str
    status: str
    invite_code: str
    expires_at: str | None
    created_at: str
    kind: str = "existing_user"
    invited_user: PublicAuthorResponse | None = None
    job_title: str | None = None
    specialization: str | None = None
    # Returned to the owner only for new-account invitations: the link to pass on manually
    activation_url: str | None = None
    # Set only in responses to create/resend: whether the email actually went out
    email_sent: bool | None = None


class InvitationWithOrgResponse(InvitationResponse):
    """Extended invitation response for the 'my invitations' view."""
    organization_name: str
