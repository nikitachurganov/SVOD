"""Queries behind full account deletion.

Order matters: requests go before forms (requests.form_id is RESTRICT) and surveys before their
projects (surveys.project_id is RESTRICT); everything hanging off a request, an organization or
the user itself goes with them through ON DELETE CASCADE.
"""

import uuid

from sqlalchemy import delete, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.form import Form
from app.models.form_file import FormFile
from app.models.organization import Organization, OrganizationInvitation, OrganizationMember
from app.models.request import Request
from app.models.request_stage_artifact import RequestStageArtifact
from app.models.survey import Survey, SurveyProject
from app.models.user import User


async def list_users_with_scheduled_deletion(
    session: AsyncSession, *, after_id: uuid.UUID | None = None, limit: int = 1
) -> list[User]:
    """People who asked to be deleted when their paid period ends, in a stable order for paging."""
    stmt = select(User).where(User.deletion_requested_at.is_not(None))
    if after_id is not None:
        stmt = stmt.where(User.id > after_id)
    result = await session.execute(stmt.order_by(User.id).limit(limit))
    return list(result.scalars().all())


async def list_owned_organizations(session: AsyncSession, user_id: uuid.UUID) -> list[Organization]:
    result = await session.execute(
        select(Organization)
        .where(Organization.owner_user_id == user_id)
        .order_by(Organization.created_at)
    )
    return list(result.scalars().all())


async def count_other_members(session: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> int:
    result = await session.execute(
        select(func.count())
        .select_from(OrganizationMember)
        .where(OrganizationMember.organization_id == org_id, OrganizationMember.user_id != user_id)
    )
    return result.scalar_one()


async def list_request_ids(
    session: AsyncSession, org_ids: list[uuid.UUID], user_id: uuid.UUID
) -> list[int]:
    """Requests of the organizations being deleted, plus the person's own requests outside any organization."""
    own_orphans = (Request.organization_id.is_(None)) & (Request.created_by_user_id == user_id)
    condition = or_(Request.organization_id.in_(org_ids), own_orphans) if org_ids else own_orphans
    result = await session.execute(select(Request.id).where(condition))
    return list(result.scalars().all())


async def list_storage_references(
    session: AsyncSession, request_ids: list[int]
) -> tuple[list[str], list[str]]:
    """Stored file URLs of form attachments and object keys of stage artifacts of these requests."""
    if not request_ids:
        return [], []
    form_urls = await session.execute(
        select(FormFile.file_url).where(FormFile.request_id.in_(request_ids))
    )
    artifact_keys = await session.execute(
        select(RequestStageArtifact.object_key).where(
            RequestStageArtifact.request_id.in_(request_ids),
            RequestStageArtifact.object_key.is_not(None),
        )
    )
    return list(form_urls.scalars().all()), list(artifact_keys.scalars().all())


async def delete_requests(session: AsyncSession, request_ids: list[int]) -> None:
    if request_ids:
        await session.execute(delete(Request).where(Request.id.in_(request_ids)))


async def delete_organization_content(session: AsyncSession, org_ids: list[uuid.UUID]) -> None:
    """Forms, surveys (with answers) and survey projects of the organizations, then the organizations."""
    if not org_ids:
        return
    # A universal form can still back requests of someone else's organization: it stays (detached)
    still_used = exists().where(Request.form_id == Form.id)
    await session.execute(delete(Form).where(Form.organization_id.in_(org_ids), ~still_used))
    await session.execute(delete(Survey).where(Survey.organization_id.in_(org_ids)))
    await session.execute(delete(SurveyProject).where(SurveyProject.organization_id.in_(org_ids)))
    await session.execute(delete(Organization).where(Organization.id.in_(org_ids)))


async def delete_invitations_for(session: AsyncSession, user_id: uuid.UUID, email: str) -> None:
    """Invitations addressed to the person (by account or by email) must not outlive the account."""
    await session.execute(
        delete(OrganizationInvitation).where(
            or_(
                OrganizationInvitation.invited_user_id == user_id,
                func.lower(OrganizationInvitation.email) == email.lower(),
            )
        )
    )


async def delete_user(session: AsyncSession, user_id: uuid.UUID) -> None:
    await session.execute(delete(User).where(User.id == user_id))
