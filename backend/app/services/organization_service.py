import secrets
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import (
    Organization,
    OrganizationInvitation,
    OrganizationMember,
)
from app.models.user import User
from app.repositories import organization_repository, user_repository
from app.schemas.organization import (
    CreateInvitationRequest,
    CreateOrganizationRequest,
    InvitationResponse,
    InvitationWithOrgResponse,
    MemberResponse,
    OrganizationResponse,
    TransferOwnershipRequest,
    UpdateOrganizationRequest,
    UpdateRoleRequest,
)
from app.schemas.user import PublicAuthorResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_author(user: User | None) -> PublicAuthorResponse | None:
    if user is None:
        return None
    return PublicAuthorResponse(
        id=str(user.id),
        first_name=user.first_name,
        last_name=user.last_name,
        middle_name=user.middle_name,
        email=user.email,
    )


def _to_org_response(org: Organization, members_count: int = 0) -> OrganizationResponse:
    return OrganizationResponse(
        id=str(org.id),
        name=org.name,
        description=org.description,
        owner_user_id=str(org.owner_user_id),
        owner=_to_author(org.owner),
        members_count=members_count,
        created_at=org.created_at.isoformat(),
        updated_at=org.updated_at.isoformat(),
    )


def _to_member_response(member: OrganizationMember) -> MemberResponse:
    return MemberResponse(
        id=str(member.id),
        user=_to_author(member.user),  # type: ignore[arg-type]
        role_tag=member.role_tag,
        joined_at=member.joined_at.isoformat(),
    )


def _to_invitation_response(inv: OrganizationInvitation) -> InvitationResponse:
    return InvitationResponse(
        id=str(inv.id),
        organization_id=str(inv.organization_id),
        email=inv.email,
        invited_by=_to_author(inv.invited_by),
        role_tag=inv.role_tag,
        status=inv.status,
        invite_code=inv.invite_code,
        expires_at=inv.expires_at.isoformat() if inv.expires_at else None,
        created_at=inv.created_at.isoformat(),
    )


def _to_invitation_with_org_response(inv: OrganizationInvitation) -> InvitationWithOrgResponse:
    return InvitationWithOrgResponse(
        id=str(inv.id),
        organization_id=str(inv.organization_id),
        organization_name=inv.organization.name if inv.organization else "",
        email=inv.email,
        invited_by=_to_author(inv.invited_by),
        role_tag=inv.role_tag,
        status=inv.status,
        invite_code=inv.invite_code,
        expires_at=inv.expires_at.isoformat() if inv.expires_at else None,
        created_at=inv.created_at.isoformat(),
    )


def _ensure_owner(org: Organization, user: User) -> None:
    if org.owner_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the organization owner can perform this action",
        )


async def _get_org_or_404(session: AsyncSession, org_id: uuid.UUID) -> Organization:
    org = await organization_repository.get_org_by_id(session, org_id)
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return org


async def _ensure_membership(
    session: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> OrganizationMember:
    member = await organization_repository.get_member(session, org_id, user_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization",
        )
    return member


# ---------------------------------------------------------------------------
# Organization CRUD
# ---------------------------------------------------------------------------

async def create_organization(
    session: AsyncSession,
    payload: CreateOrganizationRequest,
    current_user: User,
) -> OrganizationResponse:
    org = Organization(
        name=payload.name,
        description=payload.description,
        owner_user_id=current_user.id,
    )
    org = await organization_repository.create_org(session, org)

    owner_member = OrganizationMember(
        organization_id=org.id,
        user_id=current_user.id,
        role_tag="owner",
    )
    await organization_repository.add_member(session, owner_member)
    await session.commit()

    count = await organization_repository.count_members(session, org.id)
    return _to_org_response(org, members_count=count)


async def get_my_organizations(
    session: AsyncSession, current_user: User
) -> list[OrganizationResponse]:
    orgs = await organization_repository.get_orgs_for_user(session, current_user.id)
    results: list[OrganizationResponse] = []
    for org in orgs:
        count = await organization_repository.count_members(session, org.id)
        results.append(_to_org_response(org, members_count=count))
    return results


async def get_organization(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> OrganizationResponse:
    org = await _get_org_or_404(session, org_id)
    await _ensure_membership(session, org_id, current_user.id)
    count = await organization_repository.count_members(session, org.id)
    return _to_org_response(org, members_count=count)


async def update_organization(
    session: AsyncSession,
    org_id: uuid.UUID,
    payload: UpdateOrganizationRequest,
    current_user: User,
) -> OrganizationResponse:
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, current_user)

    if payload.name is not None:
        org.name = payload.name
    if payload.description is not None:
        org.description = payload.description
    org.updated_at = datetime.now(timezone.utc)

    org = await organization_repository.update_org(session, org)
    await session.commit()

    count = await organization_repository.count_members(session, org.id)
    return _to_org_response(org, members_count=count)


async def delete_organization(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> None:
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, current_user)
    await organization_repository.delete_org(session, org_id)
    await session.commit()


async def transfer_organization_ownership(
    session: AsyncSession,
    org_id: uuid.UUID,
    payload: TransferOwnershipRequest,
    current_user: User,
) -> OrganizationResponse:
    """Set organization.owner_user_id and sync member role_tag (owner/member)."""
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, current_user)

    try:
        new_owner_id = uuid.UUID(payload.new_owner_user_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid new_owner_user_id",
        ) from exc

    if new_owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already the owner",
        )

    new_member = await organization_repository.get_member(session, org_id, new_owner_id)
    if new_member is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New owner must be an existing member of the organization",
        )

    old_owner_member = await organization_repository.get_member(
        session, org_id, current_user.id
    )
    org.owner_user_id = new_owner_id
    new_member.role_tag = "owner"
    if old_owner_member is not None:
        old_owner_member.role_tag = "member"

    await session.flush()
    await session.commit()
    await session.refresh(org, attribute_names=["owner"])
    members_count = await organization_repository.count_members(session, org_id)
    return _to_org_response(org, members_count)


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

async def list_members(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> list[MemberResponse]:
    await _get_org_or_404(session, org_id)
    await _ensure_membership(session, org_id, current_user.id)
    members = await organization_repository.list_members(session, org_id)
    return [_to_member_response(m) for m in members]


async def remove_member(
    session: AsyncSession,
    org_id: uuid.UUID,
    target_user_id: uuid.UUID,
    current_user: User,
) -> None:
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, current_user)

    if target_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner cannot remove themselves. Delete the organization instead.",
        )

    removed = await organization_repository.remove_member(session, org_id, target_user_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this organization",
        )
    await session.commit()


async def update_member_role(
    session: AsyncSession,
    org_id: uuid.UUID,
    target_user_id: uuid.UUID,
    payload: UpdateRoleRequest,
    current_user: User,
) -> MemberResponse:
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, current_user)

    if target_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner cannot change their own role",
        )

    member = await organization_repository.get_member(session, org_id, target_user_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this organization",
        )

    member.role_tag = payload.role_tag
    await session.flush()
    await session.refresh(member, attribute_names=["user"])
    await session.commit()

    return _to_member_response(member)


async def leave_organization(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> None:
    org = await _get_org_or_404(session, org_id)

    if org.owner_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner cannot leave the organization. Delete it instead or transfer ownership.",
        )

    removed = await organization_repository.remove_member(session, org_id, current_user.id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a member of this organization",
        )
    await session.commit()


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

async def create_invitation(
    session: AsyncSession,
    org_id: uuid.UUID,
    payload: CreateInvitationRequest,
    current_user: User,
) -> InvitationResponse:
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, current_user)

    # Invited user must exist
    invited_user = await user_repository.get_by_email(session, str(payload.email))
    if invited_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Cannot invite yourself
    if invited_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot invite yourself",
        )

    # Already a member?
    existing_member = await organization_repository.get_member(session, org_id, invited_user.id)
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this organization",
        )

    # Duplicate pending invitation?
    existing_inv = await organization_repository.get_pending_invitation_for_user(
        session, org_id, invited_user.id
    )
    if existing_inv:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pending invitation already exists for this user",
        )

    inv = OrganizationInvitation(
        organization_id=org_id,
        email=str(payload.email),
        invited_user_id=invited_user.id,
        invited_by_user_id=current_user.id,
        role_tag="member",
        invite_code=secrets.token_urlsafe(32),
    )
    inv = await organization_repository.create_invitation(session, inv)
    await session.commit()

    return _to_invitation_response(inv)


async def list_invitations(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> list[InvitationResponse]:
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, current_user)
    invitations = await organization_repository.list_invitations(session, org_id)
    return [_to_invitation_response(i) for i in invitations]


async def get_my_invitations(
    session: AsyncSession,
    current_user: User,
) -> list[InvitationWithOrgResponse]:
    """Return all pending in-app invitations addressed to the current user."""
    invitations = await organization_repository.list_invitations_for_user(
        session, current_user.id
    )
    return [_to_invitation_with_org_response(i) for i in invitations]


async def accept_invitation(
    session: AsyncSession,
    invitation_id: uuid.UUID,
    current_user: User,
) -> MemberResponse:
    inv = await organization_repository.get_invitation_by_id(session, invitation_id)
    if inv is None or inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found or no longer valid",
        )

    if inv.invited_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invitation was not addressed to you",
        )

    if inv.expires_at and inv.expires_at < datetime.now(timezone.utc):
        inv.status = "expired"
        await session.flush()
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invitation has expired",
        )

    existing_member = await organization_repository.get_member(
        session, inv.organization_id, current_user.id
    )
    if existing_member:
        inv.status = "accepted"
        await session.flush()
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already a member of this organization",
        )

    member = OrganizationMember(
        organization_id=inv.organization_id,
        user_id=current_user.id,
        role_tag="member",
    )
    member = await organization_repository.add_member(session, member)

    inv.status = "accepted"
    await session.flush()
    await session.commit()

    return _to_member_response(member)


async def decline_invitation(
    session: AsyncSession,
    invitation_id: uuid.UUID,
    current_user: User,
) -> None:
    inv = await organization_repository.get_invitation_by_id(session, invitation_id)
    if inv is None or inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found or no longer valid",
        )

    if inv.invited_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invitation was not addressed to you",
        )

    inv.status = "declined"
    await session.flush()
    await session.commit()


async def revoke_invitation(
    session: AsyncSession,
    invitation_id: uuid.UUID,
    current_user: User,
) -> InvitationResponse:
    inv = await organization_repository.get_invitation_by_id(session, invitation_id)
    if inv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    org = await _get_org_or_404(session, inv.organization_id)
    _ensure_owner(org, current_user)

    if inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot revoke invitation with status '{inv.status}'",
        )

    inv.status = "revoked"
    await session.flush()
    await session.commit()

    return _to_invitation_response(inv)
