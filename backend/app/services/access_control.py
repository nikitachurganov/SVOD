import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import OrganizationMember
from app.models.user import User
from app.repositories import organization_repository


async def ensure_organization_member(
    session: AsyncSession,
    organization_id: uuid.UUID,
    user: User,
) -> OrganizationMember:
    member = await organization_repository.get_member(session, organization_id, user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )
    return member


async def list_accessible_organization_ids(
    session: AsyncSession,
    user: User,
) -> list[uuid.UUID]:
    organizations = await organization_repository.get_orgs_for_user(session, user.id)
    return [org.id for org in organizations]
