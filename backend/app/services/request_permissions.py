"""Access control helpers for request workflow operations."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_workflow as W
from app.models.organization import OrganizationMember
from app.models.request import Request
from app.models.request_task import RequestTask
from app.models.user import User
from app.repositories import organization_repository, request_repository


async def load_request_with_access(
    session: AsyncSession,
    request_id: int,
    user: User,
    *,
    require_org: bool = True,
) -> tuple[Request, OrganizationMember | None]:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    if req.organization_id is None:
        if require_org:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Request is not linked to an organization",
            )
        return req, None

    member = await organization_repository.get_member(session, req.organization_id, user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )
    return req, member


def is_manager(member: OrganizationMember | None) -> bool:
    return member is not None and member.role_tag in W.MANAGER_ROLE_TAGS


def can_view_request(req: Request, user: User, member: OrganizationMember | None) -> bool:
    if member is not None:
        return True
    return req.created_by_user_id == user.id


def can_edit_request_draft(req: Request, user: User) -> bool:
    return req.workflow_status == W.WF_DRAFT and req.created_by_user_id == user.id


def can_manage_workflow(member: OrganizationMember | None) -> bool:
    return is_manager(member)


def can_manage_tasks(member: OrganizationMember | None) -> bool:
    return is_manager(member)


def can_update_task(
    task: RequestTask,
    user: User,
    member: OrganizationMember | None,
) -> bool:
    if can_manage_tasks(member):
        return True
    return task.assignee_id == user.id and task.status != W.TASK_CANCELLED


def can_assign_task(member: OrganizationMember | None) -> bool:
    return can_manage_tasks(member)


async def ensure_assignee_in_org(
    session: AsyncSession,
    org_id: uuid.UUID,
    assignee_id: uuid.UUID | None,
) -> None:
    if assignee_id is None:
        return
    member = await organization_repository.get_member(session, org_id, assignee_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignee must be a member of the organization",
        )
