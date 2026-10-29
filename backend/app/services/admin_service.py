"""What the administrator sees and does with accounts.

Reading never writes: a person without a subscription row is shown on the free plan without
creating the row. Changes do not commit; the route owns the transaction.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import (
    INTERVAL_NONE,
    INTERVAL_YEAR,
    LIMIT_FIELDS,
    METRIC_AI_TOKENS,
    METRIC_RESPONSES,
    PERIOD_DAYS,
    PLAN_START,
    STATUS_ACTIVE,
    Plan,
    get_plan,
)
from app.constants.roles import ROLE_ADMIN
from app.core.config import settings
from app.models.plan_request import PlanRequest
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories import (
    admin_repository,
    billing_repository,
    payment_repository,
    plan_request_repository,
    survey_repository,
)
from app.schemas.admin import (
    AdminAiLogRow,
    AdminEvent,
    AdminGrantRequest,
    AdminLimits,
    AdminPayment,
    AdminPlanRequest,
    AdminPlanRequestList,
    AdminStats,
    AdminSubscription,
    AdminTierStats,
    AdminUsage,
    AdminUserDetail,
    AdminUserList,
    AdminUserPatch,
    AdminUserRow,
    AdminUserStats,
)
from app.schemas.billing import UsageMetric
from app.services import billing_service
from app.services import subscription_lifecycle_service as lifecycle

EVENT_ACCOUNT_BLOCKED = "account_blocked"
EVENT_ACCOUNT_UNBLOCKED = "account_unblocked"
EVENT_AI_DISABLED = "ai_disabled"
EVENT_AI_ENABLED = "ai_enabled"
EVENT_REVOKED = "admin_revoked"

REASON_REVOKED = "admin_revoked"

EVENTS_SHOWN = 50
AI_LOG_SHOWN = 50
REQUESTS_SHOWN = 20
PAYMENTS_SHOWN = 20
MAX_PAGE_SIZE = 100


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _error(status_code: int, code: str, message: str | None = None) -> HTTPException:
    detail: dict[str, str] = {"code": code}
    if message:
        detail["message"] = message
    return HTTPException(status_code=status_code, detail=detail)


def _free_subscription(now: datetime) -> Subscription:
    """The free plan of a person who has no subscription row yet; never added to the session."""
    return Subscription(
        plan_code=PLAN_START,
        status=STATUS_ACTIVE,
        billing_interval=INTERVAL_NONE,
        current_period_start=now,
        current_period_end=now + timedelta(days=PERIOD_DAYS),
        cancel_at_period_end=False,
    )


def _entitlements(sub: Subscription | None, now: datetime) -> billing_service.Entitlements:
    return billing_service.resolve_entitlements(
        sub or _free_subscription(now), now, settings.BILLING_PAST_DUE_GRACE_DAYS
    )


def _row(
    user: User,
    ent: billing_service.Entitlements,
    *,
    ai_used: int,
    surveys: int,
    responses: int,
) -> AdminUserRow:
    paid = ent.plan.code != PLAN_START
    return AdminUserRow(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        middle_name=user.middle_name,
        email=user.email,
        phone_number=user.phone_number,
        email_verified=user.email_verified_at is not None,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        is_active=user.is_active,
        ai_enabled=user.ai_enabled,
        role=user.role,
        plan_code=ent.plan.code,
        plan_title=ent.plan.title,
        subscription_status=ent.status,
        plan_ends_at=ent.period_end if paid else None,
        ai_tokens_used=ai_used,
        ai_tokens_max=ent.plan.ai_tokens_per_period,
        surveys_count=surveys,
        responses_count=responses,
        deletion_requested_at=user.deletion_requested_at,
    )


async def list_users(
    session: AsyncSession,
    *,
    query: str | None,
    tier: str | None,
    email_verified: bool | None,
    is_active: bool | None,
    role: str | None,
    deletion_requested: bool | None,
    sort: str,
    descending: bool,
    page: int,
    page_size: int,
) -> AdminUserList:
    now = _now()
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    rows, total = await admin_repository.list_users(
        session,
        now=now,
        grace_days=settings.BILLING_PAST_DUE_GRACE_DAYS,
        query=query.strip() if query else None,
        tier=tier,
        email_verified=email_verified,
        is_active=is_active,
        role=role,
        deletion_requested=deletion_requested,
        sort=sort,
        descending=descending,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    ids = [user.id for user, _ in rows]
    entitlements = {user.id: _entitlements(sub, now) for user, sub in rows}
    used = await admin_repository.usage_by_user(
        session,
        {user.id: entitlements[user.id].ai_window_start for user, sub in rows if sub is not None},
        METRIC_AI_TOKENS,
    )
    surveys = await admin_repository.survey_counts_by_owner(session, ids)
    responses = await admin_repository.response_counts_by_owner(session, ids)
    return AdminUserList(
        items=[
            _row(
                user,
                entitlements[user.id],
                ai_used=used.get(user.id, 0),
                surveys=surveys.get(user.id, 0),
                responses=responses.get(user.id, 0),
            )
            for user, _ in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


def _limits(plan: Plan) -> AdminLimits:
    return AdminLimits(
        max_active_surveys=plan.max_active_surveys,
        max_projects=plan.max_projects,
        max_questions=plan.max_questions,
        responses_per_period=plan.responses_per_period,
        max_analyzed_responses=plan.max_analyzed_responses,
        ai_tokens_per_period=plan.ai_tokens_per_period,
    )


def plan_request_view(request: PlanRequest, user: User) -> AdminPlanRequest:
    name = " ".join(part for part in (user.last_name, user.first_name, user.middle_name) if part)
    return AdminPlanRequest(
        id=request.id,
        user_id=request.user_id,
        user_email=user.email,
        user_name=name,
        plan_code=request.plan_code,
        billing_interval=request.billing_interval,
        contact=request.contact,
        comment=request.comment,
        status=request.status,
        created_at=request.created_at,
        processed_at=request.processed_at,
        decision_note=request.decision_note,
    )


async def _require_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await admin_repository.get_user(session, user_id)
    if user is None:
        raise _error(status.HTTP_404_NOT_FOUND, "user_not_found", "Пользователь не найден")
    return user


async def get_user_detail(session: AsyncSession, user_id: uuid.UUID) -> AdminUserDetail:
    user = await _require_user(session, user_id)
    now = _now()
    sub = await billing_repository.get_subscription(session, user_id)
    ent = _entitlements(sub, now)
    counters = (
        await billing_repository.get_usage(session, user_id, ent.period_start) if sub else {}
    )
    ai_counters = (
        await billing_repository.get_usage(session, user_id, ent.ai_window_start) if sub else {}
    )
    surveys = (await admin_repository.survey_counts_by_owner(session, [user_id])).get(user_id, 0)
    responses = (await admin_repository.response_counts_by_owner(session, [user_id])).get(
        user_id, 0
    )
    cost = await billing_repository.sum_ai_cost_usd(
        session, since=now - timedelta(days=30), user_id=user_id
    )

    events = (
        await billing_repository.list_events(session, sub.id, limit=EVENTS_SHOWN) if sub else []
    )
    actors = await admin_repository.emails_by_id(
        session, {event.actor_user_id for event in events if event.actor_user_id}
    )
    log = await admin_repository.list_ai_usage(session, user_id, limit=AI_LOG_SHOWN)
    requests = await plan_request_repository.list_for_user(session, user_id, limit=REQUESTS_SHOWN)
    payments = await payment_repository.list_for_user(session, user_id, limit=PAYMENTS_SHOWN)

    plan = ent.plan
    ai_used = ai_counters.get(METRIC_AI_TOKENS, 0)
    return AdminUserDetail(
        user=_row(user, ent, ai_used=ai_used, surveys=surveys, responses=responses),
        subscription=AdminSubscription(
            plan_code=plan.code,
            plan_title=plan.title,
            status=ent.status,
            billing_interval=ent.billing_interval,
            current_period_start=ent.period_start,
            current_period_end=ent.period_end,
            trial_ends_at=ent.trial_ends_at,
            trial_used=ent.trial_used,
            cancel_at_period_end=ent.cancel_at_period_end,
            limit_overrides=(sub.limit_overrides or None) if sub else None,
            limits=_limits(plan),
        ),
        usage=AdminUsage(
            ai_tokens=UsageMetric(
                used=ai_used, max=plan.ai_tokens_per_period, resets_at=ent.ai_window_end
            ),
            responses=UsageMetric(
                used=counters.get(METRIC_RESPONSES, 0), max=plan.responses_per_period
            ),
            active_surveys=UsageMetric(
                used=await survey_repository.count_open_surveys_for_owner(session, user_id),
                max=plan.max_active_surveys,
            ),
            projects=UsageMetric(
                used=await survey_repository.count_projects_for_owner(session, user_id),
                max=plan.max_projects,
            ),
            locked_responses=await survey_repository.count_locked_for_owner(session, user_id),
            ai_cost_usd_30d=float(cost),
        ),
        events=[
            AdminEvent(
                id=event.id,
                kind=event.kind,
                payload=event.payload,
                actor_user_id=event.actor_user_id,
                actor_email=actors.get(event.actor_user_id) if event.actor_user_id else None,
                created_at=event.created_at,
            )
            for event in events
        ],
        ai_usage=[
            AdminAiLogRow(
                id=row.id,
                action=row.action,
                calls=row.calls,
                model=row.model,
                prompt_tokens=row.prompt_tokens,
                completion_tokens=row.completion_tokens,
                cost_usd=float(row.cost_usd) if row.cost_usd is not None else None,
                status=row.status,
                survey_id=row.survey_id,
                created_at=row.created_at,
            )
            for row in log
        ],
        plan_requests=[plan_request_view(request, user) for request in requests],
        payments=[
            AdminPayment(
                id=payment.id,
                term=payment.term,
                amount_kopecks=payment.amount_kopecks,
                status=payment.status,
                provider_payment_id=payment.provider_payment_id,
                created_at=payment.created_at,
                paid_at=payment.paid_at,
                refunded_kopecks=payment.refunded_kopecks,
                failure_reason=payment.failure_reason,
                is_test=payment.is_test,
            )
            for payment in payments
        ],
    )


async def update_user(
    session: AsyncSession, admin: User, user_id: uuid.UUID, patch: AdminUserPatch
) -> User:
    """Block or unblock an account, switch AI on or off for it. Every change is journaled."""
    target = await _require_user(session, user_id)
    now = _now()
    changes: list[str] = []

    if patch.is_active is not None and patch.is_active != target.is_active:
        if not patch.is_active:
            if target.id == admin.id:
                raise _error(
                    status.HTTP_409_CONFLICT, "cannot_block_self", "Нельзя заблокировать себя"
                )
            if (
                target.role == ROLE_ADMIN
                and await admin_repository.count_other_active_admins(
                    session, ROLE_ADMIN, target.id
                )
                == 0
            ):
                raise _error(
                    status.HTTP_409_CONFLICT,
                    "last_admin",
                    "Нельзя заблокировать последнего администратора",
                )
        target.is_active = patch.is_active
        changes.append(EVENT_ACCOUNT_UNBLOCKED if patch.is_active else EVENT_ACCOUNT_BLOCKED)

    if patch.ai_enabled is not None and patch.ai_enabled != target.ai_enabled:
        target.ai_enabled = patch.ai_enabled
        changes.append(EVENT_AI_ENABLED if patch.ai_enabled else EVENT_AI_DISABLED)

    if changes:
        await session.flush()
        sub = await billing_service.ensure_subscription(session, target.id, now)
        for kind in changes:
            await billing_repository.add_event(
                session, subscription_id=sub.id, kind=kind, payload=None, actor_user_id=admin.id
            )
    return target


def _check_overrides(overrides: dict[str, int] | None) -> None:
    if not overrides:
        return
    for key, value in overrides.items():
        if key not in LIMIT_FIELDS:
            raise _error(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_limit", f"Неизвестный лимит: {key}"
            )
        if value < 0:
            raise _error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "invalid_limit",
                f"Лимит «{key}» не может быть отрицательным",
            )


async def grant_plan(
    session: AsyncSession, admin: User, user_id: uuid.UUID, payload: AdminGrantRequest
) -> Subscription:
    """Give a paid plan by hand, the same way the command line does."""
    target = await _require_user(session, user_id)
    _check_overrides(payload.limit_overrides)
    until = payload.until
    if until is not None and until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    try:
        return await lifecycle.grant(
            session,
            target.id,
            payload.plan,
            days=payload.days,
            until=until,
            actor_user_id=admin.id,
            note=payload.note,
            limit_overrides=payload.limit_overrides,
        )
    except ValueError as exc:
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "grant_failed", str(exc)) from exc


async def revoke_plan(session: AsyncSession, admin: User, user_id: uuid.UUID) -> Subscription:
    """Take the paid plan away now: the person goes back to the free plan at once."""
    target = await _require_user(session, user_id)
    now = _now()
    sub = await billing_repository.get_subscription(session, target.id)
    if sub is None or sub.plan_code == PLAN_START:
        raise _error(
            status.HTTP_409_CONFLICT, "nothing_to_revoke", "У пользователя нет платного тарифа"
        )
    if target.deletion_requested_at is not None:
        # The scheduled deletion waits for the paid period to end; ending it now would delete the account
        raise _error(
            status.HTTP_409_CONFLICT,
            "deletion_scheduled",
            "Аккаунт запланирован к удалению по окончании тарифа: снятие тарифа удалит его",
        )
    from_plan = sub.plan_code
    if sub.current_period_end > now:
        # The free window starts where the paid access ended, which is now
        sub.current_period_end = now
    closed = await lifecycle.expire_subscription(session, sub, now, REASON_REVOKED)
    await billing_repository.add_event(
        session,
        subscription_id=sub.id,
        kind=EVENT_REVOKED,
        payload={"from_plan": from_plan, "closed_surveys": closed},
        actor_user_id=admin.id,
    )
    return sub


async def list_plan_requests(
    session: AsyncSession, *, status_filter: str | None, page: int, page_size: int
) -> AdminPlanRequestList:
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    rows, total = await plan_request_repository.list_requests(
        session, status=status_filter, offset=(page - 1) * page_size, limit=page_size
    )
    return AdminPlanRequestList(
        items=[plan_request_view(request, user) for request, user in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


def _monthly_kopecks(plan_code: str, interval: str, count: int) -> int:
    plan = get_plan(plan_code)
    if interval == INTERVAL_YEAR:
        return plan.price_year_kopecks // 12 * count
    return plan.price_month_kopecks * count


async def get_stats(session: AsyncSession) -> AdminStats:
    now = _now()
    grace = settings.BILLING_PAST_DUE_GRACE_DAYS
    users = await admin_repository.user_totals(session, now)
    tiers = await admin_repository.tier_totals(session, now, grace)
    paying = await admin_repository.paid_by_interval(session, now)
    revenue = sum(_monthly_kopecks(plan, interval, count) for plan, interval, count in paying)
    cost_usd: Decimal = await billing_repository.sum_ai_cost_usd(
        session, since=now - timedelta(days=30)
    )
    cost_rub = float(cost_usd) * settings.AI_COST_RUB_PER_USD
    return AdminStats(
        users=AdminUserStats(**users),
        plans=AdminTierStats(
            free=tiers[admin_repository.TIER_FREE],
            trial=tiers[admin_repository.TIER_TRIAL],
            paid=tiers[admin_repository.TIER_PAID],
            past_due=tiers[admin_repository.TIER_PAST_DUE],
        ),
        expected_monthly_revenue_kopecks=revenue,
        received_30d_kopecks=await payment_repository.sum_received(
            session, since=now - timedelta(days=30)
        ),
        ai_cost_usd_30d=float(cost_usd),
        ai_cost_rub_30d=round(cost_rub, 2),
        # A ratio: 0.12 is twelve percent of the revenue (the cost in kopecks over the revenue)
        ai_cost_share_of_revenue=round(cost_rub * 100 / revenue, 4) if revenue > 0 else None,
        pending_plan_requests=await plan_request_repository.count_pending(session),
    )
