import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_execution as C
from app.core import request_service
from app.core.config import settings
from app.core.name_utils import build_display_name
from app.core.security import PENDING_ACTIVATION_HASH, is_pending_activation
from app.models.request_stage import RequestStage
from app.constants import team_roles
from app.services import email_service, team_seat_service, welcome_seed_service

from app.models.external_contractor import ExternalContractor
from app.models.organization import (
    Organization,
    OrganizationInvitation,
    OrganizationMember,
)
from app.models.user import User
from app.repositories import external_contractor_repository, organization_repository, user_repository
from app.schemas.external_contractor import (
    CreateExternalContractorPayload,
    ExternalContractorResponse,
    UpdateExternalContractorPayload,
)
from app.schemas.organization import (
    CreateInvitationRequest,
    CreateOrganizationRequest,
    InvitationResponse,
    InvitationWithOrgResponse,
    MemberResponse,
    OrganizationResponse,
    SeatUsageResponse,
    TransferOwnershipRequest,
    UpdateMemberAiLimitRequest,
    UpdateOrganizationRequest,
    UpdateRoleRequest,
)
from app.schemas.user import PublicAuthorResponse


INVITE_EXISTING_USER = "existing_user"
INVITE_NEW_ACCOUNT = "new_account"

PERSONAL_ORGANIZATION_NAME = "Личное пространство"


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


def _to_org_response(
    org: Organization, members_count: int = 0, my_role: str | None = None
) -> OrganizationResponse:
    return OrganizationResponse(
        id=str(org.id),
        name=org.name,
        description=org.description,
        owner_user_id=str(org.owner_user_id),
        owner=_to_author(org.owner),
        members_count=members_count,
        is_personal=org.is_personal,
        my_role=team_roles.normalize_role(my_role) if my_role else None,
        created_at=org.created_at.isoformat(),
        updated_at=org.updated_at.isoformat(),
    )


def _to_member_response(member: OrganizationMember) -> MemberResponse:
    return MemberResponse(
        id=str(member.id),
        user=_to_author(member.user),  # type: ignore[arg-type]
        role_tag=member.role_tag,
        joined_at=member.joined_at.isoformat(),
        job_title=member.job_title,
        specialization=member.specialization,
        token_plus_limit=member.token_plus_limit,
    )


def activation_url(invite_code: str) -> str:
    return f"{request_service.app_base_url()}/activate/{invite_code}"


def _to_invitation_response(
    inv: OrganizationInvitation, *, email_sent: bool | None = None
) -> InvitationResponse:
    is_account = inv.kind == INVITE_NEW_ACCOUNT
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
        kind=inv.kind,
        invited_user=_to_author(inv.invited_user),
        job_title=inv.job_title,
        specialization=inv.specialization,
        activation_url=activation_url(inv.invite_code) if is_account and inv.status == "pending" else None,
        email_sent=email_sent,
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


async def _ensure_can_manage_members(
    session: AsyncSession, org: Organization, user: User
) -> OrganizationMember | None:
    """The owner or an admin: invite, remove, change roles. Returns the caller's membership.

    The owner is recognised without a lookup (no membership row is needed for that).
    """
    if org.owner_user_id == user.id:
        return None
    member = await organization_repository.get_member(session, org.id, user.id)
    if member is None or not team_roles.can_manage_members(member.role_tag):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the organization owner or an admin can perform this action",
        )
    return member


def ensure_not_personal(org: Organization) -> None:
    """A personal workspace belongs to one person: it cannot be deleted, handed over or opened to others."""
    if org.is_personal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Личное пространство нельзя удалить, передать или открыть для других",
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
        # A team lives in the service it was created in
        service=request_service.current_service(),
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
    return _to_org_response(org, members_count=count, my_role=team_roles.ROLE_OWNER)


async def get_or_create_personal_organization(
    session: AsyncSession, current_user: User
) -> OrganizationResponse:
    """The user's personal workspace; created on first use. Safe to call repeatedly and concurrently."""
    org = await organization_repository.get_personal_org(session, current_user.id)
    if org is None:
        try:
            org = await organization_repository.create_org(
                session,
                Organization(
                    name=PERSONAL_ORGANIZATION_NAME,
                    owner_user_id=current_user.id,
                    is_personal=True,
                    service=request_service.SERVICE_SURVEYS,
                ),
            )
            await organization_repository.add_member(
                session,
                OrganizationMember(
                    organization_id=org.id, user_id=current_user.id, role_tag="owner"
                ),
            )
            # A new workspace starts with a sample survey; the IntegrityError branch below
            # means another request created the workspace, so the seed is never doubled
            await welcome_seed_service.seed_welcome_project(session, org.id, current_user.id)
            await session.commit()
        except IntegrityError:
            # A parallel request created it first (one personal workspace per user)
            await session.rollback()
            org = await organization_repository.get_personal_org(session, current_user.id)
            if org is None:
                raise

    count = await organization_repository.count_members(session, org.id)
    return _to_org_response(org, members_count=count, my_role=team_roles.ROLE_OWNER)


async def get_my_organizations(
    session: AsyncSession, current_user: User
) -> list[OrganizationResponse]:
    orgs = await organization_repository.get_orgs_for_user(
        session, current_user.id, service=request_service.current_service()
    )
    roles = await organization_repository.get_role_tags_for_user(session, current_user.id)
    results: list[OrganizationResponse] = []
    for org in orgs:
        count = await organization_repository.count_members(session, org.id)
        results.append(_to_org_response(org, members_count=count, my_role=roles.get(org.id)))
    return results


async def get_organization(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> OrganizationResponse:
    org = await _get_org_or_404(session, org_id)
    member = await _ensure_membership(session, org_id, current_user.id)
    count = await organization_repository.count_members(session, org.id)
    return _to_org_response(org, members_count=count, my_role=member.role_tag)


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
    return _to_org_response(org, members_count=count, my_role=team_roles.ROLE_OWNER)


async def delete_organization(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> None:
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, current_user)
    ensure_not_personal(org)
    await organization_repository.delete_org(session, org_id)
    await session.commit()


async def transfer_organization_ownership(
    session: AsyncSession,
    org_id: uuid.UUID,
    payload: TransferOwnershipRequest,
    current_user: User,
) -> OrganizationResponse:
    """Set organization.owner_user_id and sync member role_tag (the former owner becomes an admin)."""
    org = await _get_org_or_404(session, org_id)
    _ensure_owner(org, current_user)
    ensure_not_personal(org)

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
        old_owner_member.role_tag = team_roles.ROLE_ADMIN

    await session.flush()
    await session.commit()
    await session.refresh(org, attribute_names=["owner"])
    members_count = await organization_repository.count_members(session, org_id)
    return _to_org_response(org, members_count)


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

async def get_seat_usage(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> SeatUsageResponse:
    """Occupied and available places of the team, for the owner and the admins."""
    org = await _get_org_or_404(session, org_id)
    await _ensure_can_manage_members(session, org, current_user)
    usage, ent = await team_seat_service.usage_for_org(session, org)
    unlimited = not ent.billing_enabled or usage.seats_limit >= team_roles.SEATS_UNLIMITED
    return SeatUsageResponse(
        seats_used=usage.seats_used,
        seats_limit=None if unlimited else usage.seats_limit,
        readers=usage.readers,
        readers_limit=team_roles.MAX_READERS_PER_TEAM,
        plan_code=ent.plan.code,
        billing_enabled=ent.billing_enabled,
    )


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
    caller = await _ensure_can_manage_members(session, org, current_user)

    if target_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner cannot remove themselves. Delete the organization instead.",
        )
    if target_user_id == org.owner_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="The owner cannot be removed"
        )
    if caller is not None:
        # An admin looks after editors and readers; another admin is the owner's business
        target = await organization_repository.get_member(session, org_id, target_user_id)
        if target is not None and team_roles.normalize_role(target.role_tag) in (
            team_roles.ROLE_ADMIN,
            team_roles.ROLE_OWNER,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the owner can remove an admin",
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
    caller = await _ensure_can_manage_members(session, org, current_user)

    if target_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role",
        )

    member = await organization_repository.get_member(session, org_id, target_user_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this organization",
        )
    current_role = team_roles.normalize_role(member.role_tag)
    if current_role == team_roles.ROLE_OWNER or target_user_id == org.owner_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The owner's role changes only by handing the team over",
        )

    new_role = team_roles.parse_assignable_role(payload.role_tag)
    if new_role is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Role must be one of: admin, editor, reader",
        )
    if caller is not None and team_roles.ROLE_ADMIN in (current_role, new_role):
        # Admins are made and unmade by the owner only
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can assign or take away the admin role",
        )
    if new_role != current_role:
        await team_seat_service.ensure_room(
            session, org, new_role, replacing_role=member.role_tag
        )

    member.role_tag = new_role
    await session.flush()
    await session.refresh(member, attribute_names=["user"])
    await session.commit()

    return _to_member_response(member)


async def update_member_ai_limit(
    session: AsyncSession,
    org_id: uuid.UUID,
    target_user_id: uuid.UUID,
    payload: UpdateMemberAiLimitRequest,
    current_user: User,
) -> MemberResponse:
    """Cap (or uncap) how much of the team's Токены+ one member may spend per period.

    The owner and the admins set it. It binds editors and admins; the owner spends the pool
    without a cap, and a reader has no AI at all.
    """
    org = await _get_org_or_404(session, org_id)
    await _ensure_can_manage_members(session, org, current_user)

    member = await organization_repository.get_member(session, org_id, target_user_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this organization",
        )
    if target_user_id == org.owner_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The owner spends the team's pool without a personal cap",
        )
    if not team_roles.can_edit(member.role_tag):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A reader has no AI to cap",
        )

    member.token_plus_limit = payload.token_plus_limit
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

def _new_invite_code() -> str:
    return secrets.token_urlsafe(32)


def _invite_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=max(1, settings.INVITATION_TTL_DAYS))


async def _send_invitation_email(inv: OrganizationInvitation, org: Organization, inviter: User) -> bool:
    inviter_name = build_display_name(
        last_name=inviter.last_name, first_name=inviter.first_name, middle_name=inviter.middle_name
    )
    if inv.kind == INVITE_NEW_ACCOUNT:
        invitee = inv.invited_user
        return await email_service.send_account_invitation(
            to=inv.email,
            first_name=invitee.first_name if invitee else "",
            organization_name=org.name,
            inviter_name=inviter_name,
            activation_url=activation_url(inv.invite_code),
            ttl_days=settings.INVITATION_TTL_DAYS,
        )
    return await email_service.send_organization_invitation(
        to=inv.email,
        organization_name=org.name,
        inviter_name=inviter_name,
        app_url=request_service.app_base_url(),
    )


async def create_invitation(
    session: AsyncSession,
    org_id: uuid.UUID,
    payload: CreateInvitationRequest,
    current_user: User,
) -> InvitationResponse:
    """Add a person to the organization by email.

    * registered user: in-app invitation (accepted from notifications);
    * unknown email: an inactive account is created from the owner's data and the person
      activates it by the emailed link (sets own password), becoming a member.
    """
    org = await _get_org_or_404(session, org_id)
    await _ensure_can_manage_members(session, org, current_user)
    ensure_not_personal(org)
    email = str(payload.email).strip()
    role = team_roles.parse_assignable_role(payload.role_tag)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Role must be one of: admin, editor, reader",
        )
    if role == team_roles.ROLE_ADMIN and org.owner_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can invite an admin",
        )

    invited_user = await user_repository.get_by_email(session, email)
    if invited_user is not None and invited_user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot invite yourself")

    kind = INVITE_EXISTING_USER
    if invited_user is None or is_pending_activation(invited_user.password_hash):
        kind = INVITE_NEW_ACCOUNT
        if not payload.first_name or not payload.last_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Укажите имя и фамилию: для этого адреса будет создан новый аккаунт",
            )

    if invited_user is not None:
        if await organization_repository.get_member(session, org_id, invited_user.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member of this organization",
            )
        if await organization_repository.get_pending_invitation_for_user(session, org_id, invited_user.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Pending invitation already exists for this user",
            )

    if kind == INVITE_NEW_ACCOUNT:
        if invited_user is None:
            invited_user = User(
                full_name=build_display_name(
                    last_name=payload.last_name or "",
                    first_name=payload.first_name or "",
                    middle_name=payload.middle_name,
                ),
                first_name=payload.first_name or "",
                last_name=payload.last_name or "",
                middle_name=payload.middle_name,
                email=email,
                phone_number=payload.phone_number or "",
                password_hash=PENDING_ACTIVATION_HASH,
                is_active=False,
            )
            invited_user = await user_repository.create(session, invited_user)
        else:
            # Re-invite of a never-activated account: refresh the data the owner entered
            invited_user.first_name = payload.first_name or invited_user.first_name
            invited_user.last_name = payload.last_name or invited_user.last_name
            invited_user.middle_name = payload.middle_name
            invited_user.phone_number = payload.phone_number or invited_user.phone_number
            invited_user.full_name = build_display_name(
                last_name=invited_user.last_name,
                first_name=invited_user.first_name,
                middle_name=invited_user.middle_name,
            )

    await team_seat_service.ensure_room(session, org, role)

    inv = OrganizationInvitation(
        organization_id=org_id,
        email=email,
        invited_user_id=invited_user.id,
        invited_by_user_id=current_user.id,
        role_tag=role,
        kind=kind,
        job_title=payload.job_title,
        specialization=payload.specialization,
        invite_code=_new_invite_code(),
        expires_at=_invite_expiry(),
    )
    inv = await organization_repository.create_invitation(session, inv)
    await session.refresh(inv, attribute_names=["invited_user"])
    await session.commit()

    email_sent = await _send_invitation_email(inv, org, current_user)
    return _to_invitation_response(inv, email_sent=email_sent)


async def resend_invitation(
    session: AsyncSession,
    invitation_id: uuid.UUID,
    current_user: User,
) -> InvitationResponse:
    """Issue a fresh link (the old one stops working), extend the expiry and email it again."""
    inv = await organization_repository.get_invitation_by_id(session, invitation_id)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    org = await _get_org_or_404(session, inv.organization_id)
    await _ensure_can_manage_members(session, org, current_user)
    if inv.status not in ("pending", "expired"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot resend invitation with status '{inv.status}'",
        )

    inv.status = "pending"
    inv.invite_code = _new_invite_code()
    inv.expires_at = _invite_expiry()
    await session.flush()
    await session.refresh(inv, attribute_names=["invited_user", "invited_by"])
    await session.commit()

    email_sent = await _send_invitation_email(inv, org, current_user)
    return _to_invitation_response(inv, email_sent=email_sent)


async def list_invitations(
    session: AsyncSession, org_id: uuid.UUID, current_user: User
) -> list[InvitationResponse]:
    org = await _get_org_or_404(session, org_id)
    await _ensure_can_manage_members(session, org, current_user)
    invitations = await organization_repository.list_invitations(session, org_id)
    return [_to_invitation_response(i) for i in invitations]


async def get_my_invitations(
    session: AsyncSession,
    current_user: User,
) -> list[InvitationWithOrgResponse]:
    """Return all pending in-app invitations addressed to the current user."""
    invitations = await organization_repository.list_invitations_for_user(
        session, current_user.id, service=request_service.current_service()
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

    # The invitation already holds its place, so it does not count against itself
    role = team_roles.normalize_role(inv.role_tag)
    await team_seat_service.ensure_room(
        session, inv.organization, role, already_counted=True
    )

    member = OrganizationMember(
        organization_id=inv.organization_id,
        user_id=current_user.id,
        role_tag=role,
        job_title=inv.job_title,
        specialization=inv.specialization,
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
    await _ensure_can_manage_members(session, org, current_user)

    if inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot revoke invitation with status '{inv.status}'",
        )

    inv.status = "revoked"
    await session.flush()
    await session.commit()

    return _to_invitation_response(inv)


def _to_external_contractor_response(c: ExternalContractor) -> ExternalContractorResponse:
    rating_f = float(c.rating) if c.rating is not None else None
    return ExternalContractorResponse(
        id=str(c.id),
        full_name=c.full_name,
        organization=c.organization,
        specialization=c.specialization,
        position=c.position,
        geography=c.geography,
        contact_kind=c.contact_kind,
        contact_value=c.contact_value,
        rating=rating_f,
    )


async def create_external_contractor(
    session: AsyncSession,
    organization_id: uuid.UUID,
    payload: CreateExternalContractorPayload,
    current_user: User,
) -> ExternalContractorResponse:
    org = await _get_org_or_404(session, organization_id)
    _ensure_owner(org, current_user)

    row = ExternalContractor(
        organization_id=organization_id,
        full_name=payload.full_name,
        organization=payload.organization,
        specialization=payload.specialization,
        position=payload.position,
        geography=payload.geography,
        contact_kind=payload.contact_kind,
        contact_value=payload.contact_value,
        rating=payload.rating,
    )
    row = await external_contractor_repository.create(session, row)
    await session.commit()
    return _to_external_contractor_response(row)


async def list_external_contractors(
    session: AsyncSession,
    organization_id: uuid.UUID,
    current_user: User,
) -> list[ExternalContractorResponse]:
    await _ensure_membership(session, organization_id, current_user.id)
    rows = await external_contractor_repository.list_by_org(session, organization_id)
    return [_to_external_contractor_response(row) for row in rows]


async def _get_contractor_for_owner(
    session: AsyncSession,
    organization_id: uuid.UUID,
    contractor_id: uuid.UUID,
    current_user: User,
) -> ExternalContractor:
    org = await _get_org_or_404(session, organization_id)
    _ensure_owner(org, current_user)
    row = await external_contractor_repository.get_by_id(session, contractor_id, organization_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")
    return row


async def update_external_contractor(
    session: AsyncSession,
    organization_id: uuid.UUID,
    contractor_id: uuid.UUID,
    payload: UpdateExternalContractorPayload,
    current_user: User,
) -> ExternalContractorResponse:
    row = await _get_contractor_for_owner(session, organization_id, contractor_id, current_user)
    for field in payload.model_fields_set:
        value = getattr(payload, field)
        if isinstance(value, str):
            value = value.strip() or None
        if field == "full_name" and not value:
            continue
        setattr(row, field, value)
    row.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(row)
    return _to_external_contractor_response(row)


async def delete_external_contractor(
    session: AsyncSession,
    organization_id: uuid.UUID,
    contractor_id: uuid.UUID,
    current_user: User,
) -> None:
    row = await _get_contractor_for_owner(session, organization_id, contractor_id, current_user)
    active_assignments = await session.scalar(
        select(func.count(RequestStage.id)).where(
            RequestStage.assignee_external_contractor_id == row.id,
            RequestStage.status.not_in(tuple(C.STAGE_TERMINAL)),
        )
    )
    if active_assignments:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Подрядчик назначен на незавершённые этапы: сначала назначьте другого исполнителя",
        )
    await session.delete(row)
    await session.commit()
