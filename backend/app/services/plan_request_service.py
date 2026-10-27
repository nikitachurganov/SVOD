"""Requests for a paid plan: a person asks, an administrator activates after the payment.

Nothing here commits: the caller owns the transaction. Emails are sent by the caller after the
commit, so a mail server that is slow or down never undoes a decision.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import (
    COURSE_PACK_DAYS,
    INTERVAL_MONTH,
    INTERVAL_ONE_OFF,
    INTERVAL_YEAR,
    PLAN_START,
    PLANS,
)
from app.core.config import settings
from app.models.plan_request import (
    PLAN_REQUEST_APPROVED,
    PLAN_REQUEST_PENDING,
    PLAN_REQUEST_REJECTED,
    PlanRequest,
)
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories import billing_repository, plan_request_repository, user_repository
from app.schemas.billing import PlanRequestCreate
from app.services import billing_mail, billing_service
from app.services import subscription_lifecycle_service as lifecycle

EVENT_PLAN_REQUEST_CREATED = "plan_request_created"
EVENT_PLAN_REQUEST_APPROVED = "plan_request_approved"
EVENT_PLAN_REQUEST_REJECTED = "plan_request_rejected"

# How long a plan runs when the administrator does not name a term
DAYS_BY_INTERVAL = {
    INTERVAL_MONTH: 30,
    INTERVAL_YEAR: 365,
    INTERVAL_ONE_OFF: COURSE_PACK_DAYS,
}


@dataclass(frozen=True)
class Decision:
    """The outcome of a decision on a request, with what the caller needs for the email."""

    request: PlanRequest
    user: User
    subscription: Subscription | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _error(status_code: int, code: str, message: str | None = None) -> HTTPException:
    detail: dict[str, str] = {"code": code}
    if message:
        detail["message"] = message
    return HTTPException(status_code=status_code, detail=detail)


async def create_request(
    session: AsyncSession, user: User, payload: PlanRequestCreate, now: datetime | None = None
) -> PlanRequest:
    """A person asks for a paid plan. One request waits at a time."""
    plan = PLANS.get(payload.plan_code)
    if plan is None or plan.code == PLAN_START:
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_plan", "Такого тарифа нет")
    if payload.billing_interval not in DAYS_BY_INTERVAL:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_interval", "Неверный срок подключения"
        )
    now = now or _now()
    request = await plan_request_repository.create_if_none_pending(
        session,
        user_id=user.id,
        plan_code=plan.code,
        billing_interval=payload.billing_interval,
        contact=payload.contact,
        comment=payload.comment,
        now=now,
    )
    if request is None:
        raise _error(status.HTTP_409_CONFLICT, "plan_request_pending")
    sub = await billing_service.ensure_subscription(session, user.id, now)
    await billing_repository.add_event(
        session,
        subscription_id=sub.id,
        kind=EVENT_PLAN_REQUEST_CREATED,
        payload={
            "request_id": str(request.id),
            "plan": plan.code,
            "interval": payload.billing_interval,
        },
        actor_user_id=user.id,
    )
    return request


async def announce_to_admin(request: PlanRequest, user: User) -> None:
    """Tell the administrator about a new request; run it after the commit. Never raises."""
    to = settings.ADMIN_NOTIFY_EMAIL.strip()
    if not to:
        return
    plan = PLANS.get(request.plan_code)
    person = " ".join(part for part in (user.last_name, user.first_name) if part)
    await lifecycle.deliver(
        billing_mail.send_plan_request_to_admin(
            to=to,
            person=person,
            email=user.email,
            plan_title=plan.title if plan else request.plan_code,
            interval=request.billing_interval,
            contact=request.contact,
            comment=request.comment,
        )
    )


async def tell_applicant(decision: Decision) -> None:
    """Tell the person what was decided on the request; run it after the commit. Never raises."""
    request, user = decision.request, decision.user
    if request.status == PLAN_REQUEST_APPROVED and decision.subscription is not None:
        plan = PLANS.get(request.plan_code)
        await lifecycle.deliver(
            billing_mail.send_plan_granted(
                user,
                plan.title if plan else request.plan_code,
                decision.subscription.current_period_end,
            )
        )
    elif request.status == PLAN_REQUEST_REJECTED:
        await lifecycle.deliver(billing_mail.send_plan_request_rejected(user, request.decision_note))


async def _lock_pending(session: AsyncSession, request_id: uuid.UUID) -> PlanRequest:
    # The row lock makes a second click wait, then find the request already decided
    request = await plan_request_repository.get_by_id(session, request_id, for_update=True)
    if request is None:
        raise _error(status.HTTP_404_NOT_FOUND, "plan_request_not_found", "Заявка не найдена")
    if request.status != PLAN_REQUEST_PENDING:
        raise _error(status.HTTP_409_CONFLICT, "plan_request_processed")
    return request


async def approve(
    session: AsyncSession,
    request_id: uuid.UUID,
    admin: User,
    *,
    days: int | None = None,
    note: str | None = None,
    now: datetime | None = None,
) -> Decision:
    """Activate the plan the person asked for, for the requested term or for ``days``."""
    now = now or _now()
    request = await _lock_pending(session, request_id)
    user = await user_repository.get_by_id(session, request.user_id)
    if user is None or not user.is_active:
        raise _error(
            status.HTTP_409_CONFLICT, "user_inactive", "Аккаунт отключён, тариф не подключить"
        )
    term = days or DAYS_BY_INTERVAL.get(request.billing_interval, DAYS_BY_INTERVAL[INTERVAL_MONTH])
    try:
        sub = await lifecycle.grant(
            session,
            user.id,
            request.plan_code,
            days=term,
            actor_user_id=admin.id,
            note=note,
            now=now,
        )
    except ValueError as exc:
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "grant_failed", str(exc)) from exc

    request.status = PLAN_REQUEST_APPROVED
    request.processed_by_user_id = admin.id
    request.processed_at = now
    request.decision_note = note
    await session.flush()
    await billing_repository.add_event(
        session,
        subscription_id=sub.id,
        kind=EVENT_PLAN_REQUEST_APPROVED,
        payload={
            "request_id": str(request.id),
            "plan": request.plan_code,
            "days": term,
            "until": sub.current_period_end.isoformat(),
            "note": note,
        },
        actor_user_id=admin.id,
    )
    return Decision(request=request, user=user, subscription=sub)


async def reject(
    session: AsyncSession,
    request_id: uuid.UUID,
    admin: User,
    *,
    reason: str | None = None,
    now: datetime | None = None,
) -> Decision:
    now = now or _now()
    request = await _lock_pending(session, request_id)
    user = await user_repository.get_by_id(session, request.user_id)
    if user is None:
        raise _error(status.HTTP_404_NOT_FOUND, "plan_request_not_found", "Заявка не найдена")
    request.status = PLAN_REQUEST_REJECTED
    request.processed_by_user_id = admin.id
    request.processed_at = now
    request.decision_note = reason
    await session.flush()
    sub = await billing_service.ensure_subscription(session, user.id, now)
    await billing_repository.add_event(
        session,
        subscription_id=sub.id,
        kind=EVENT_PLAN_REQUEST_REJECTED,
        payload={"request_id": str(request.id), "plan": request.plan_code, "reason": reason},
        actor_user_id=admin.id,
    )
    return Decision(request=request, user=user, subscription=sub)
