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
    # The caller's role in this organization (owner, admin, editor, reader); None when the answer
    # is not about the caller's own membership
    my_role: str | None = None
    # The plan the workspace works on (the owner's); filled in the list of the caller's workspaces,
    # None where the answer is not about the plan or when the tariffs are switched off
    plan_code: str | None = None
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
    # Personal cap of Токены+ per period; None: spends from the shared pool without a cap
    token_plus_limit: int | None = None


class UpdateRoleRequest(BaseModel):
    role_tag: str = Field(..., min_length=1, max_length=50)


class UpdateMemberAiLimitRequest(BaseModel):
    """A personal cap on the team's Токены+ for one member per period; null removes it."""

    token_plus_limit: int | None = Field(None, ge=0, le=1_000_000_000)


class SeatUsageResponse(BaseModel):
    """How many paid places the team uses (members and unanswered invitations) and how many it has."""

    # Over all the owner's teams in this service: the seats are the owner's, not the team's
    seats_used: int
    # Of seats_used: people who hold a seat only in the owner's other teams
    seats_used_elsewhere: int = 0
    # null: no limit (billing is switched off)
    seats_limit: int | None
    readers: int
    readers_limit: int
    plan_code: str
    billing_enabled: bool
    # The shared pool of Токены+ of the team (the owner's counter); null while the owner is on the
    # free plan, where everybody spends their own allowance
    ai_pool_used: int | None = None
    ai_pool_max: int | None = None
    ai_pool_resets_at: datetime | None = None
    # What each person spent from the pool in this period: {user_id: tokens}
    # (to the owner and the admins only; empty for the others)
    ai_spent_by_user: dict[str, int] = Field(default_factory=dict)
    # What the caller spent from the pool in this period; null without a pool
    ai_spent_me: int | None = None
    # Days left of the one-time window in which the 2nd and 3rd seats keep the kit price; 0: no window
    seat_window_days_left: int = 0


class TransferOwnershipRequest(BaseModel):
    new_owner_user_id: str = Field(..., min_length=1, max_length=64)


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

class CreateInvitationRequest(BaseModel):
    """The owner or an admin adds a person by email, with a role: admin, editor (default) or reader.

    A registered user gets an in-app invitation; for an unknown email an inactive account is
    created from the fields below and the person activates it by the emailed link.
    """
    email: EmailStr
    role_tag: str = Field("editor", min_length=1, max_length=50)
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
