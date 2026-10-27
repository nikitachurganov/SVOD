"""The life of a subscription once it exists: trial, grant, cancellation, expiry and the downgrade.

The functions that change a subscription do not commit: the caller owns the transaction. The one
exception is the worker entry ``process_due``, which commits after every subscription, so a failure
never undoes the others and a row stays locked only while it is being handled.

A paid plan that ran out does not linger as a half-state: the subscription is turned into a free
one with a fresh 30-day window (``expire_subscription``), the limits that no longer fit are
enforced (``enforce_downgrade``: surveys beyond the free plan's limit are closed, nothing is
deleted) and the person is told by email.
"""

from __future__ import annotations

import logging
import uuid
from collections import Counter
from collections.abc import Awaitable
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import (
    INTERVAL_NONE,
    INTERVAL_ONE_OFF,
    PLAN_RESEARCHER,
    PLAN_START,
    PLANS,
    START,
    STATUS_ACTIVE,
    STATUS_PAST_DUE,
    STATUS_TRIALING,
    clean_overrides,
    get_plan,
)
from app.core.config import settings
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories import billing_repository, survey_repository, user_repository
from app.services import billing_mail, billing_service, email_service

logger = logging.getLogger(__name__)

EVENT_MANUAL_GRANT = "manual_grant"
EVENT_TRIAL_STARTED = "trial_started"
EVENT_TRIAL_REMINDER = "trial_ending_notified"
EVENT_EXPIRY_REMINDER = "expiring_notified"
EVENT_EXPIRED = "expired"
EVENT_DOWNGRADE_CLOSED = "downgrade_closed_surveys"
EVENT_CANCELED = "canceled"
EVENT_RESUMED = "resumed"
EVENT_LIMIT_WARNING = "limit_warning"

REASON_TRIAL_ENDED = "trial_ended"
REASON_PERIOD_ENDED = "period_ended"
REASON_GRACE_OVER = "grace_over"

TRIAL_REMINDER_DAYS = 2
EXPIRY_REMINDER_DAYS = 3
# A pending warning email that could not be sent is given up after this long
WARNING_RETRY_HOURS = 24
# How many subscriptions one worker tick handles per step
BATCH = 50


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _conflict(code: str, **extra: Any) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": code, **extra})


async def _deletion_scheduled(session: AsyncSession, user_id: uuid.UUID) -> bool:
    user = await user_repository.get_by_id(session, user_id)
    return user is not None and user.deletion_requested_at is not None


# ─── What a person or an operator does ────────────────────────────────────────


async def grant(
    session: AsyncSession,
    user_id: uuid.UUID,
    plan_code: str,
    *,
    days: int | None = None,
    until: datetime | None = None,
    actor_user_id: uuid.UUID | None = None,
    note: str | None = None,
    limit_overrides: dict[str, Any] | None = None,
    interval: str = INTERVAL_ONE_OFF,
    now: datetime | None = None,
) -> Subscription:
    """Give a paid plan by hand: for a payment by invoice, a gift, a compensation, the beta.

    ``interval`` is what the term was paid as (month, year, one_off); it only labels the period.

    ``days`` adds to a period that is already running (the plan is extended); ``until`` sets the
    end date and never shortens a longer running period. The responses the quota kept back are
    opened. A grant that extends the period also moves the date of a scheduled account deletion,
    which follows the end of the paid period. Raises ValueError for a bad plan or term.
    """
    plan = PLANS.get(plan_code)
    if plan is None or plan.code == PLAN_START:
        raise ValueError(f"Выдать можно только платный тариф: {PLAN_RESEARCHER}")
    if (days is None) == (until is None):
        raise ValueError("Нужен ровно один из параметров: срок в днях или дата окончания")
    if days is not None and days < 1:
        raise ValueError("Срок должен быть не меньше одного дня")
    now = now or _now()

    sub = await billing_service.ensure_subscription(session, user_id, now)
    running = (
        sub.plan_code == plan.code
        and sub.status == STATUS_ACTIVE
        and sub.current_period_end > now
    )
    start = sub.current_period_start if running else now
    if until is not None:
        end = max(until, sub.current_period_end) if running else until
    else:
        end = (sub.current_period_end if running else now) + timedelta(days=days)
    if end <= now:
        raise ValueError("Дата окончания уже в прошлом")

    sub.plan_code = plan.code
    sub.status = STATUS_ACTIVE
    sub.billing_interval = interval
    sub.current_period_start, sub.current_period_end = start, end
    sub.trial_ends_at = None
    if not await _deletion_scheduled(session, user_id):
        sub.cancel_at_period_end = False
    if limit_overrides is not None:
        sub.limit_overrides = clean_overrides(limit_overrides) or None
    await session.flush()
    await billing_repository.add_event(
        session,
        subscription_id=sub.id,
        kind=EVENT_MANUAL_GRANT,
        payload={"plan": plan.code, "until": end.isoformat(), "extended": running, "note": note},
        actor_user_id=actor_user_id,
    )
    await billing_service.unlock_responses(session, user_id, actor_user_id=actor_user_id)
    return sub


async def start_trial(session: AsyncSession, user: User, now: datetime | None = None) -> Subscription:
    """The free trial of the paid plan, once per person; the mailbox must be confirmed."""
    now = now or _now()
    # Without SMTP nobody can confirm a mailbox, so nobody is asked to (as everywhere else)
    if email_service.is_configured() and user.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "email_not_verified",
                "message": "Подтвердите адрес почты, чтобы запустить пробный период.",
            },
        )
    sub = await billing_service.ensure_subscription(session, user.id, now)
    if sub.trial_used_at is not None:
        raise _conflict("trial_used")
    current = billing_service.resolve_entitlements(sub, now, settings.BILLING_PAST_DUE_GRACE_DAYS)
    if current.plan.code != PLAN_START:
        raise _conflict("already_subscribed")

    ends_at = now + timedelta(days=settings.BILLING_TRIAL_DAYS)
    sub.plan_code = PLAN_RESEARCHER
    sub.status = STATUS_TRIALING
    sub.billing_interval = INTERVAL_NONE
    sub.current_period_start, sub.current_period_end = now, ends_at
    sub.trial_ends_at = ends_at
    sub.trial_used_at = now
    sub.cancel_at_period_end = False
    await session.flush()
    await billing_repository.add_event(
        session,
        subscription_id=sub.id,
        kind=EVENT_TRIAL_STARTED,
        payload={"days": settings.BILLING_TRIAL_DAYS, "ends_at": ends_at.isoformat()},
    )
    return sub


async def cancel(session: AsyncSession, user_id: uuid.UUID, now: datetime | None = None) -> Subscription:
    """Do not renew: the paid plan works until the end of the period that is paid for."""
    now = now or _now()
    sub = await billing_service.ensure_subscription(session, user_id, now)
    current = billing_service.resolve_entitlements(sub, now, settings.BILLING_PAST_DUE_GRACE_DAYS)
    if current.plan.code == PLAN_START:
        raise _conflict("nothing_to_cancel")
    if not sub.cancel_at_period_end:
        sub.cancel_at_period_end = True
        await session.flush()
        await billing_repository.add_event(
            session,
            subscription_id=sub.id,
            kind=EVENT_CANCELED,
            payload={"period_end": sub.current_period_end.isoformat()},
        )
    return sub


async def resume(session: AsyncSession, user: User, now: datetime | None = None) -> Subscription:
    """Take the cancellation back. Not while the account is scheduled for deletion."""
    if user.deletion_requested_at is not None:
        raise _conflict("deletion_scheduled")
    now = now or _now()
    sub = await billing_service.ensure_subscription(session, user.id, now)
    current = billing_service.resolve_entitlements(sub, now, settings.BILLING_PAST_DUE_GRACE_DAYS)
    if current.plan.code == PLAN_START:
        raise _conflict("nothing_to_resume")
    if sub.cancel_at_period_end:
        sub.cancel_at_period_end = False
        await session.flush()
        await billing_repository.add_event(
            session, subscription_id=sub.id, kind=EVENT_RESUMED, payload=None
        )
    return sub


async def cancel_for_account_deletion(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Stop the renewal before the account goes. Once payments exist this is also where the
    recurring subscription is cancelled at the provider, so no money is taken from a deleted
    account (stage 8)."""
    sub = await billing_repository.get_subscription(session, user_id)
    if sub is not None and sub.plan_code != PLAN_START and not sub.cancel_at_period_end:
        sub.cancel_at_period_end = True
        await session.flush()


async def active_paid_subscription(
    session: AsyncSession, user_id: uuid.UUID, now: datetime | None = None
) -> Subscription | None:
    """A paid period that is running: an active paid plan that is not over. A trial or a late
    payment does not count as paid."""
    now = now or _now()
    sub = await billing_repository.get_subscription(session, user_id)
    if (
        sub is not None
        and sub.plan_code != PLAN_START
        and sub.status == STATUS_ACTIVE
        and sub.current_period_end > now
    ):
        return sub
    return None


# ─── Expiry and the downgrade ─────────────────────────────────────────────────


async def enforce_downgrade(session: AsyncSession, user_id: uuid.UUID) -> list[uuid.UUID]:
    """Close the published surveys beyond the free plan's limit, keeping the most active ones.

    Nothing is deleted and the answers stay; only collecting stops. Projects and questions over
    the limit are left alone: the free plan just cannot add more of them.
    """
    open_ids = await survey_repository.list_open_survey_ids_by_activity(session, user_id)
    to_close = open_ids[START.max_active_surveys :]
    if not to_close:
        return []
    await survey_repository.close_surveys(session, to_close)
    sub = await billing_service.ensure_subscription(session, user_id)
    await billing_repository.add_event(
        session,
        subscription_id=sub.id,
        kind=EVENT_DOWNGRADE_CLOSED,
        payload={"count": len(to_close), "survey_ids": [str(sid) for sid in to_close]},
    )
    return to_close


async def expire_subscription(
    session: AsyncSession, sub: Subscription, now: datetime, reason: str
) -> int:
    """Turn a paid subscription whose time is up into the free one. Returns how many surveys
    were closed by the downgrade."""
    from_plan = sub.plan_code
    # The free window starts where access ended, not at the moment the worker noticed
    window_start, window_end = billing_service.free_window(sub.current_period_end, now)
    sub.plan_code = PLAN_START
    sub.status = STATUS_ACTIVE
    sub.billing_interval = INTERVAL_NONE
    sub.current_period_start, sub.current_period_end = window_start, window_end
    sub.trial_ends_at = None
    sub.cancel_at_period_end = False
    # The individual limits went together with the paid plan
    sub.limit_overrides = None
    sub.provider = sub.provider_subscription_id = sub.payment_method_ref = None
    await session.flush()
    await billing_repository.add_event(
        session,
        subscription_id=sub.id,
        kind=EVENT_EXPIRED,
        payload={"from_plan": from_plan, "reason": reason},
    )
    return len(await enforce_downgrade(session, sub.user_id))


# ─── 80 % of a limit ──────────────────────────────────────────────────────────


async def warn_if_near_limit(
    session: AsyncSession,
    user_id: uuid.UUID,
    metric: str,
    used: int,
    limit: int,
    period_start: datetime,
) -> bool:
    """Queue the "80 % used" email at the moment the usage crosses the threshold.

    The email goes out from the worker (a request must not wait for SMTP). Only in enforced mode:
    while limits do not block, a warning about them would only confuse. Once per metric and period.
    """
    if not settings.BILLING_ENFORCE or used != billing_service.warning_threshold(limit):
        return False
    sub = await billing_service.ensure_subscription(session, user_id)
    match = {"metric": metric, "period_start": period_start.isoformat()}
    if await billing_repository.has_event(session, sub.id, EVENT_LIMIT_WARNING, match):
        return False
    await billing_repository.add_event(
        session,
        subscription_id=sub.id,
        kind=EVENT_LIMIT_WARNING,
        payload={**match, "used": used, "limit": limit, "sent": False},
    )
    return True


# ─── The worker ───────────────────────────────────────────────────────────────


async def deliver(sending: Awaitable[bool]) -> bool:
    """True when the moment can be marked as handled: the email went, or none can ever go."""
    try:
        sent = await sending
    except Exception:
        logger.exception("Could not send a subscription email")
        sent = False
    return sent or not email_service.is_configured()


def _expiry_reason(sub: Subscription) -> str:
    if sub.status == STATUS_TRIALING:
        return REASON_TRIAL_ENDED
    if sub.status == STATUS_PAST_DUE:
        return REASON_GRACE_OVER
    return REASON_PERIOD_ENDED


def _renews_itself(sub: Subscription) -> bool:
    """An auto-renewing paid subscription is the payment flow's business (stage 8), not expiry's."""
    return (
        sub.status == STATUS_ACTIVE
        and sub.provider is not None
        and not sub.cancel_at_period_end
        and sub.billing_interval != INTERVAL_ONE_OFF
    )


async def _expire_due(session: AsyncSession, now: datetime) -> int:
    grace = settings.BILLING_PAST_DUE_GRACE_DAYS
    expired, last_id = 0, None
    for _ in range(BATCH):
        due = await billing_repository.list_due_subscriptions(session, now, after_id=last_id, limit=1)
        if not due:
            break
        sub = due[0]
        last_id = sub.id
        if billing_service.effective_plan_code(sub, now, grace) != PLAN_START or _renews_itself(sub):
            await session.rollback()  # let go of the row lock
            continue
        reason, plan_title = _expiry_reason(sub), get_plan(sub.plan_code).title
        user = await user_repository.get_by_id(session, sub.user_id)
        try:
            closed = await expire_subscription(session, sub, now, reason)
            await session.commit()
        except Exception:
            logger.exception("Could not expire the subscription %s", sub.id)
            await session.rollback()
            continue
        expired += 1
        if user is not None:
            if reason == REASON_TRIAL_ENDED:
                await deliver(billing_mail.send_trial_ended(user, closed))
            else:
                await deliver(billing_mail.send_plan_ended(user, plan_title, closed))
    return expired


async def _remind_trials(session: AsyncSession, now: datetime) -> int:
    until, sent, last_id = now + timedelta(days=TRIAL_REMINDER_DAYS), 0, None
    for _ in range(BATCH):
        rows = await billing_repository.list_ending_trials(
            session, now, until, after_id=last_id, limit=1
        )
        if not rows:
            break
        sub = rows[0]
        last_id = sub.id
        user = await user_repository.get_by_id(session, sub.user_id)
        if user is None or await billing_repository.has_event(session, sub.id, EVENT_TRIAL_REMINDER):
            await session.rollback()
            continue
        if await deliver(billing_mail.send_trial_ending(user, sub.trial_ends_at)):
            await billing_repository.add_event(
                session,
                subscription_id=sub.id,
                kind=EVENT_TRIAL_REMINDER,
                payload={"ends_at": sub.trial_ends_at.isoformat()},
            )
            sent += 1
        await session.commit()
    return sent


async def _remind_expiring(session: AsyncSession, now: datetime) -> int:
    until, sent, last_id = now + timedelta(days=EXPIRY_REMINDER_DAYS), 0, None
    for _ in range(BATCH):
        rows = await billing_repository.list_ending_plans(session, now, until, after_id=last_id, limit=1)
        if not rows:
            break
        sub = rows[0]
        last_id = sub.id
        user = await user_repository.get_by_id(session, sub.user_id)
        match = {"period_end": sub.current_period_end.isoformat()}
        if (
            user is None
            or _renews_itself(sub)
            or await billing_repository.has_event(session, sub.id, EVENT_EXPIRY_REMINDER, match)
        ):
            await session.rollback()
            continue
        title = get_plan(sub.plan_code).title
        if await deliver(billing_mail.send_plan_ending(user, title, sub.current_period_end)):
            await billing_repository.add_event(
                session, subscription_id=sub.id, kind=EVENT_EXPIRY_REMINDER, payload=match
            )
            sent += 1
        await session.commit()
    return sent


async def _send_limit_warnings(session: AsyncSession, now: datetime) -> int:
    events = await billing_repository.list_unsent_events(session, EVENT_LIMIT_WARNING, limit=BATCH)
    sent = 0
    for event in events:
        payload = dict(event.payload or {})
        sub = await session.get(Subscription, event.subscription_id)
        user = await user_repository.get_by_id(session, sub.user_id) if sub is not None else None
        handled = user is None
        if user is not None:
            handled = await deliver(
                billing_mail.send_limit_warning(
                    user, payload.get("metric", ""), payload.get("used", 0), payload.get("limit", 0)
                )
            )
        gave_up = now - event.created_at > timedelta(hours=WARNING_RETRY_HOURS)
        if handled or gave_up:
            event.payload = {**payload, "sent": True}
            sent += int(handled)
    await session.commit()
    return sent


async def process_due(session: AsyncSession, now: datetime | None = None) -> Counter[str]:
    """One worker tick for subscriptions: expiries first, then the reminders and warnings."""
    now = now or _now()
    done: Counter[str] = Counter()
    for name, step in (
        ("expired", _expire_due),
        ("trial_reminders", _remind_trials),
        ("expiry_reminders", _remind_expiring),
        ("limit_warnings", _send_limit_warnings),
    ):
        try:
            done[name] = await step(session, now)
        except Exception:
            logger.exception("Subscription step %s failed", name)
            await session.rollback()
    return done
