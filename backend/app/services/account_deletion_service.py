"""Deleting the signed-in person's account together with their data, now or when the paid period ends.

With a paid plan running, deleting at once would throw away time that was paid for. The person is
warned (409 ``active_subscription``) and may agree to delete the account when the period ends:
renewal is switched off, ``users.deletion_requested_at`` is set, the account works as usual until
then and the worker removes it (``process_scheduled_deletions``). Reminders go out a week and a
day before; the person can cancel the deletion until the last moment.
"""

import logging
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import PLAN_START, STATUS_ACTIVE
from app.core.config import settings
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories import account_deletion_repository as repo
from app.repositories import billing_repository
from app.schemas.auth import DeleteAccountRequest
from app.services import auth_service, billing_mail, storage_service
from app.services import subscription_lifecycle_service as lifecycle

logger = logging.getLogger(__name__)

EVENT_DELETION_SCHEDULED = "deletion_scheduled"
EVENT_DELETION_CANCELED = "deletion_canceled"
EVENT_DELETION_BLOCKED = "deletion_blocked"
# Days before the deletion at which the person is reminded; the nearest one that applies is sent
REMINDER_DAYS = (1, 7)
BATCH = 50


@dataclass(frozen=True)
class DeletionOutcome:
    """deleted: the account is gone. Otherwise it is scheduled and goes at ``delete_at``."""

    deleted: bool
    delete_at: datetime | None = None


class SharedOrganizationsError(Exception):
    """The person owns organizations where other people work: deleting them would destroy those
    people's data too."""

    def __init__(self, names: list[str]):
        super().__init__(", ".join(names))
        self.names = names


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _shared_message(names: list[str]) -> str:
    listed = ", ".join(f"«{name}»" for name in names)
    return (
        f"Вы владелец организаций с другими участниками: {listed}. "
        "Передайте владение или удалите их, затем повторите удаление аккаунта."
    )


async def _shared_organization_names(session: AsyncSession, user: User, owned: list) -> list[str]:
    """Organizations where other people still work: deleting them would destroy their data too."""
    return [
        org.name
        for org in owned
        if not org.is_personal and await repo.count_other_members(session, org.id, user.id) > 0
    ]


async def _purge_files(object_keys: list[str]) -> None:
    """Best effort, after the commit: a stray object in the bucket is better than a half-deleted account."""
    for key in object_keys:
        try:
            await storage_service.delete_object(key)
        except Exception:  # noqa: BLE001 - the account is already gone, keep removing the rest
            logger.warning("Could not delete stored file %s of a deleted account", key, exc_info=True)


async def _purge(session: AsyncSession, user: User, owned: list) -> None:
    """Remove the account and what belongs to it, then the stored files (after the commit)."""
    org_ids = [org.id for org in owned]
    request_ids = await repo.list_request_ids(session, org_ids, user.id)
    form_urls, artifact_keys = await repo.list_storage_references(session, request_ids)
    object_keys = [
        key for key in (storage_service.key_from_url(url) for url in form_urls) if key
    ] + artifact_keys
    avatar_key = storage_service.key_from_url(user.avatar_url) if user.avatar_url else None
    if avatar_key:
        object_keys.append(avatar_key)

    await repo.delete_requests(session, request_ids)
    await repo.delete_organization_content(session, org_ids)
    await repo.delete_invitations_for(session, user.id, user.email)
    await repo.delete_user(session, user.id)
    await session.commit()

    if settings.FILE_STORAGE_BACKEND == "s3":
        await _purge_files(object_keys)


async def purge_account(session: AsyncSession, user: User) -> None:
    """Delete the account without a password: the person agreed earlier (the worker's deferred
    deletion). Raises SharedOrganizationsError, deleting nothing, if other people depend on it."""
    owned = await repo.list_owned_organizations(session, user.id)
    shared = await _shared_organization_names(session, user, owned)
    if shared:
        raise SharedOrganizationsError(shared)
    await _purge(session, user, owned)


async def _schedule_deletion(
    session: AsyncSession, user: User, sub: Subscription
) -> DeletionOutcome:
    """The account stays as it is until the paid period ends; renewal is switched off."""
    newly = user.deletion_requested_at is None
    if newly:
        user.deletion_requested_at = _now()
    sub.cancel_at_period_end = True
    if newly:
        await billing_repository.add_event(
            session,
            subscription_id=sub.id,
            kind=EVENT_DELETION_SCHEDULED,
            payload={"delete_at": sub.current_period_end.isoformat()},
            actor_user_id=user.id,
        )
    await session.commit()
    return DeletionOutcome(deleted=False, delete_at=sub.current_period_end)


async def delete_account(
    session: AsyncSession, user: User, payload: DeleteAccountRequest
) -> DeletionOutcome:
    """Delete the account, its personal workspace and organizations nobody else belongs to.

    Organizations with other members block the deletion (409): the owner has to hand them over
    or delete them first. In other people's organizations the membership is dropped and what the
    person created there stays, without an author. With a paid period running the account is not
    deleted at once: 409 ``active_subscription`` first, then, if the person agrees
    (``defer_until_subscription_ends``), it is scheduled for the end of the period.
    """
    auth_service.check_current_password(user, payload.password)

    owned = await repo.list_owned_organizations(session, user.id)
    shared = await _shared_organization_names(session, user, owned)
    if shared:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_shared_message(shared))

    if settings.BILLING_ENABLED:
        paid = await lifecycle.active_paid_subscription(session, user.id)
        if paid is not None:
            if not payload.defer_until_subscription_ends:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "active_subscription",
                        "plan": paid.plan_code,
                        "current_period_end": paid.current_period_end.isoformat(),
                        "can_defer": True,
                    },
                )
            return await _schedule_deletion(session, user, paid)
        await lifecycle.cancel_for_account_deletion(session, user.id)

    await _purge(session, user, owned)
    return DeletionOutcome(deleted=True)


async def cancel_scheduled_deletion(session: AsyncSession, user: User) -> bool:
    """The person changed their mind. Renewal stays off: they switch it on themselves.

    Returns whether a deletion was scheduled (cancelling nothing is not an error).
    """
    if user.deletion_requested_at is None:
        return False
    user.deletion_requested_at = None
    sub = await billing_repository.get_subscription(session, user.id)
    if sub is not None:
        await billing_repository.add_event(
            session,
            subscription_id=sub.id,
            kind=EVENT_DELETION_CANCELED,
            payload=None,
            actor_user_id=user.id,
        )
    await session.commit()
    return True


# ─── The worker ───────────────────────────────────────────────────────────────


def _paid_period_running(sub: Subscription | None, now: datetime) -> bool:
    return (
        sub is not None
        and sub.plan_code != PLAN_START
        and sub.status == STATUS_ACTIVE
        and sub.current_period_end > now
    )


async def process_scheduled_deletions(
    session: AsyncSession, now: datetime | None = None
) -> Counter[str]:
    """Delete the accounts whose paid period is over. A longer period (a grant) moves the date."""
    now = now or _now()
    done: Counter[str] = Counter()
    last_id = None
    for _ in range(BATCH):
        users = await repo.list_users_with_scheduled_deletion(session, after_id=last_id, limit=1)
        if not users:
            break
        user = users[0]
        last_id = user.id
        sub = await billing_repository.get_subscription(session, user.id)
        if _paid_period_running(sub, now):
            continue
        email, first_name = user.email, user.first_name
        try:
            await purge_account(session, user)
        except SharedOrganizationsError as exc:
            user.deletion_requested_at = None
            if sub is not None:
                await billing_repository.add_event(
                    session,
                    subscription_id=sub.id,
                    kind=EVENT_DELETION_BLOCKED,
                    payload={"organizations": exc.names},
                )
            await session.commit()
            done["blocked"] += 1
            await lifecycle.deliver(billing_mail.send_deletion_blocked(user, exc.names))
            continue
        except Exception:
            logger.exception("Could not delete the scheduled account %s", user.id)
            await session.rollback()
            continue
        done["deleted"] += 1
        await lifecycle.deliver(billing_mail.send_account_deleted(email, first_name))
    return done


async def send_deletion_reminders(session: AsyncSession, now: datetime | None = None) -> int:
    """A week and a day before the deletion; only the nearest reminder that still applies is sent,
    and none for a deletion asked for too late to be reminded of."""
    now = now or _now()
    sent, last_id = 0, None
    for _ in range(BATCH):
        users = await repo.list_users_with_scheduled_deletion(session, after_id=last_id, limit=1)
        if not users:
            break
        user = users[0]
        last_id = user.id
        sub = await billing_repository.get_subscription(session, user.id)
        if not _paid_period_running(sub, now):
            continue
        delete_at = sub.current_period_end
        for days in REMINDER_DAYS:
            threshold = delete_at - timedelta(days=days)
            if now < threshold or user.deletion_requested_at >= threshold:
                continue
            kind, match = f"deletion_reminder_{days}d", {"delete_at": delete_at.isoformat()}
            if not await billing_repository.has_event(session, sub.id, kind, match):
                if await lifecycle.deliver(billing_mail.send_deletion_reminder(user, delete_at, days)):
                    await billing_repository.add_event(
                        session, subscription_id=sub.id, kind=kind, payload=match
                    )
                    await session.commit()
                    sent += 1
            break
    return sent
