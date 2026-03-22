import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.organization import (
    Organization,
    OrganizationInvitation,
    OrganizationMember,
)


# ---------------------------------------------------------------------------
# Organization CRUD
# ---------------------------------------------------------------------------

async def get_org_by_id(
    session: AsyncSession, org_id: uuid.UUID
) -> Organization | None:
    stmt = (
        select(Organization)
        .options(selectinload(Organization.owner))
        .where(Organization.id == org_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_orgs_for_user(
    session: AsyncSession, user_id: uuid.UUID
) -> list[Organization]:
    """Return organizations where the user is a member (includes owned)."""
    stmt = (
        select(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .options(selectinload(Organization.owner))
        .where(OrganizationMember.user_id == user_id)
        .order_by(Organization.created_at.desc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def create_org(session: AsyncSession, org: Organization) -> Organization:
    session.add(org)
    await session.flush()
    await session.refresh(org, attribute_names=["owner"])
    return org


async def update_org(session: AsyncSession, org: Organization) -> Organization:
    await session.flush()
    await session.refresh(org, attribute_names=["owner"])
    return org


async def delete_org(session: AsyncSession, org_id: uuid.UUID) -> bool:
    stmt = delete(Organization).where(Organization.id == org_id)
    result = await session.execute(stmt)
    return result.rowcount > 0


async def count_members(session: AsyncSession, org_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(OrganizationMember)
        .where(OrganizationMember.organization_id == org_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

async def get_member(
    session: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> OrganizationMember | None:
    stmt = (
        select(OrganizationMember)
        .options(selectinload(OrganizationMember.user))
        .where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_members(
    session: AsyncSession, org_id: uuid.UUID
) -> list[OrganizationMember]:
    stmt = (
        select(OrganizationMember)
        .options(selectinload(OrganizationMember.user))
        .where(OrganizationMember.organization_id == org_id)
        .order_by(OrganizationMember.joined_at.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def add_member(
    session: AsyncSession, member: OrganizationMember
) -> OrganizationMember:
    session.add(member)
    await session.flush()
    await session.refresh(member, attribute_names=["user"])
    return member


async def remove_member(
    session: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    stmt = delete(OrganizationMember).where(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id,
    )
    result = await session.execute(stmt)
    return result.rowcount > 0


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------

async def get_invitation_by_id(
    session: AsyncSession, invitation_id: uuid.UUID
) -> OrganizationInvitation | None:
    stmt = (
        select(OrganizationInvitation)
        .options(
            selectinload(OrganizationInvitation.invited_by),
            selectinload(OrganizationInvitation.organization),
        )
        .where(OrganizationInvitation.id == invitation_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_invitation_by_code(
    session: AsyncSession, code: str
) -> OrganizationInvitation | None:
    stmt = (
        select(OrganizationInvitation)
        .options(
            selectinload(OrganizationInvitation.invited_by),
            selectinload(OrganizationInvitation.organization),
        )
        .where(OrganizationInvitation.invite_code == code)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_invitations(
    session: AsyncSession, org_id: uuid.UUID
) -> list[OrganizationInvitation]:
    stmt = (
        select(OrganizationInvitation)
        .options(selectinload(OrganizationInvitation.invited_by))
        .where(OrganizationInvitation.organization_id == org_id)
        .order_by(OrganizationInvitation.created_at.desc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def create_invitation(
    session: AsyncSession, inv: OrganizationInvitation
) -> OrganizationInvitation:
    session.add(inv)
    await session.flush()
    await session.refresh(inv, attribute_names=["invited_by", "organization"])
    return inv


async def list_invitations_for_user(
    session: AsyncSession, user_id: uuid.UUID
) -> list[OrganizationInvitation]:
    """Return all pending invitations addressed to the given user."""
    stmt = (
        select(OrganizationInvitation)
        .options(
            selectinload(OrganizationInvitation.invited_by),
            selectinload(OrganizationInvitation.organization),
        )
        .where(
            OrganizationInvitation.invited_user_id == user_id,
            OrganizationInvitation.status == "pending",
        )
        .order_by(OrganizationInvitation.created_at.desc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_pending_invitation_for_user(
    session: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> OrganizationInvitation | None:
    """Check whether a pending invitation already exists for this user+org pair."""
    stmt = select(OrganizationInvitation).where(
        OrganizationInvitation.organization_id == org_id,
        OrganizationInvitation.invited_user_id == user_id,
        OrganizationInvitation.status == "pending",
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()
