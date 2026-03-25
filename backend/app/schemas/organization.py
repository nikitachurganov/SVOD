from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

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


class UpdateRoleRequest(BaseModel):
    role_tag: str = Field(..., min_length=1, max_length=50)


class TransferOwnershipRequest(BaseModel):
    new_owner_user_id: str = Field(..., min_length=1, max_length=64)


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

class CreateInvitationRequest(BaseModel):
    """Owner invites a registered user by email. Role is always 'member'."""
    email: EmailStr


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


class InvitationWithOrgResponse(InvitationResponse):
    """Extended invitation response for the 'my invitations' view."""
    organization_name: str
