"""The administrator's pages: users, plan requests, the summary.

Every route here needs the administrator role. It is demanded for the whole router, so a route
added later cannot be left open by mistake, and it is read from the database on each request.
"""

import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.api.deps import AdminUser, DbSession, get_admin_user
from app.schemas.admin import (
    AdminApproveRequest,
    AdminGrantRequest,
    AdminPlanRequest,
    AdminPlanRequestList,
    AdminRejectRequest,
    AdminStats,
    AdminUserDetail,
    AdminUserList,
    AdminUserPatch,
)
from app.services import admin_service, plan_request_service

router = APIRouter(dependencies=[Depends(get_admin_user)])


@router.get("/users", response_model=AdminUserList)
async def list_users(
    session: DbSession,
    q: str | None = Query(default=None, max_length=100),
    tier: Literal["free", "paid", "trial", "past_due"] | None = None,
    email_verified: bool | None = None,
    is_active: bool | None = None,
    role: Literal["user", "admin"] | None = None,
    deletion_requested: bool | None = None,
    sort: Literal["created_at", "last_login_at", "email", "name", "plan_ends_at"] = "created_at",
    direction: Literal["asc", "desc"] = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=admin_service.MAX_PAGE_SIZE),
) -> AdminUserList:
    return await admin_service.list_users(
        session,
        query=q,
        tier=tier,
        email_verified=email_verified,
        is_active=is_active,
        role=role,
        deletion_requested=deletion_requested,
        sort=sort,
        descending=direction == "desc",
        page=page,
        page_size=page_size,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user(user_id: uuid.UUID, session: DbSession) -> AdminUserDetail:
    return await admin_service.get_user_detail(session, user_id)


@router.patch("/users/{user_id}", response_model=AdminUserDetail)
async def update_user(
    user_id: uuid.UUID, payload: AdminUserPatch, session: DbSession, admin: AdminUser
) -> AdminUserDetail:
    await admin_service.update_user(session, admin, user_id, payload)
    await session.commit()
    return await admin_service.get_user_detail(session, user_id)


@router.post("/users/{user_id}/subscription", response_model=AdminUserDetail)
async def grant_subscription(
    user_id: uuid.UUID, payload: AdminGrantRequest, session: DbSession, admin: AdminUser
) -> AdminUserDetail:
    await admin_service.grant_plan(session, admin, user_id, payload)
    await session.commit()
    return await admin_service.get_user_detail(session, user_id)


@router.delete("/users/{user_id}/subscription", response_model=AdminUserDetail)
async def revoke_subscription(
    user_id: uuid.UUID, session: DbSession, admin: AdminUser
) -> AdminUserDetail:
    await admin_service.revoke_plan(session, admin, user_id)
    await session.commit()
    return await admin_service.get_user_detail(session, user_id)


@router.get("/plan-requests", response_model=AdminPlanRequestList)
async def list_plan_requests(
    session: DbSession,
    status: Literal["pending", "approved", "rejected"] | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=admin_service.MAX_PAGE_SIZE),
) -> AdminPlanRequestList:
    return await admin_service.list_plan_requests(
        session, status_filter=status, page=page, page_size=page_size
    )


@router.post("/plan-requests/{request_id}/approve", response_model=AdminPlanRequest)
async def approve_plan_request(
    request_id: uuid.UUID,
    payload: AdminApproveRequest,
    session: DbSession,
    admin: AdminUser,
    background_tasks: BackgroundTasks,
) -> AdminPlanRequest:
    decision = await plan_request_service.approve(
        session, request_id, admin, days=payload.days, note=payload.note
    )
    view = admin_service.plan_request_view(decision.request, decision.user)
    await session.commit()
    background_tasks.add_task(plan_request_service.tell_applicant, decision)
    return view


@router.post("/plan-requests/{request_id}/reject", response_model=AdminPlanRequest)
async def reject_plan_request(
    request_id: uuid.UUID,
    payload: AdminRejectRequest,
    session: DbSession,
    admin: AdminUser,
    background_tasks: BackgroundTasks,
) -> AdminPlanRequest:
    decision = await plan_request_service.reject(session, request_id, admin, reason=payload.reason)
    view = admin_service.plan_request_view(decision.request, decision.user)
    await session.commit()
    background_tasks.add_task(plan_request_service.tell_applicant, decision)
    return view


@router.get("/stats", response_model=AdminStats)
async def get_stats(session: DbSession) -> AdminStats:
    return await admin_service.get_stats(session)
