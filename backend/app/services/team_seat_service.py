"""Seats of a team: who takes one, and whether one more person fits.

A seat is taken by the owner, the admins and the editors, and also by an invitation that has not
been answered yet (otherwise a team could invite more people than it pays for and let them all in
later). A reader takes no seat, but there are at most MAX_READERS_PER_TEAM of them.

The paid places come from the plan of the team owner (Entitlements.seats). The rule follows the
same switches as every other plan limit: with BILLING_ENABLED off nothing is checked; in shadow
mode (BILLING_ENFORCE off) a broken rule is only counted in svod_billing_limit_hit_total; when
enforced it refuses with 402 limit_reached.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.team_roles import MAX_READERS_PER_TEAM, takes_seat
from app.core.config import settings
from app.core.metrics import BILLING_LIMIT_HIT
from app.models.organization import Organization
from app.repositories import organization_repository
from app.services import billing_service

LIMIT_SEATS = "seats"
LIMIT_READERS = "readers"

INVITATION_PENDING = "pending"


@dataclass(frozen=True)
class SeatUsage:
    seats_used: int
    readers: int
    seats_limit: int


def count_roles(roles: Iterable[str | None]) -> tuple[int, int]:
    """(places taken, readers) for the given role tags."""
    seats = readers = 0
    for role in roles:
        if takes_seat(role):
            seats += 1
        else:
            readers += 1
    return seats, readers


def without_role(usage: SeatUsage, role: str | None) -> SeatUsage:
    """The usage with one person of this role taken out (they stay, only their role changes)."""
    if takes_seat(role):
        return SeatUsage(max(usage.seats_used - 1, 0), usage.readers, usage.seats_limit)
    return SeatUsage(usage.seats_used, max(usage.readers - 1, 0), usage.seats_limit)


def blocking_limit(usage: SeatUsage, role: str | None) -> str | None:
    """Which limit stops one more person with this role, or None when they fit."""
    if takes_seat(role):
        return LIMIT_SEATS if usage.seats_used >= usage.seats_limit else None
    return LIMIT_READERS if usage.readers >= MAX_READERS_PER_TEAM else None


def limit_value(usage: SeatUsage, limit: str) -> tuple[int, int]:
    """(used, maximum) of the limit that blocked, for the 402 body."""
    if limit == LIMIT_SEATS:
        return usage.seats_used, usage.seats_limit
    return usage.readers, MAX_READERS_PER_TEAM


async def usage_for_org(
    session: AsyncSession, org: Organization
) -> tuple[SeatUsage, billing_service.Entitlements]:
    """Places and readers in use now (members and unanswered invitations), with the plan."""
    ent = await billing_service.get_entitlements(session, org.owner_user_id)
    members = await organization_repository.list_members(session, org.id)
    invitations = await organization_repository.list_invitations(session, org.id)
    roles = [m.role_tag for m in members]
    roles += [i.role_tag for i in invitations if i.status == INVITATION_PENDING]
    seats, readers = count_roles(roles)
    return SeatUsage(seats, readers, ent.seats), ent


async def ensure_room(
    session: AsyncSession,
    org: Organization,
    role: str | None,
    *,
    replacing_role: str | None = None,
    already_counted: bool = False,
) -> None:
    """Refuse (when enforced) adding a person with ``role`` to a team that has no room for them.

    ``replacing_role`` is the current role of a person who stays and only changes role: they are
    taken out of the count first. ``already_counted`` is for accepting an invitation, which
    already holds its place as a pending invitation.
    """
    usage, ent = await usage_for_org(session, org)
    if not ent.billing_enabled:
        return
    if replacing_role is not None:
        usage = without_role(usage, replacing_role)
    if already_counted:
        usage = without_role(usage, role)
    limit = blocking_limit(usage, role)
    if limit is None:
        return
    enforced = settings.BILLING_ENFORCE
    BILLING_LIMIT_HIT.labels(limit, ent.plan.code, "true" if enforced else "false").inc()
    if enforced:
        used, maximum = limit_value(usage, limit)
        raise billing_service.limit_reached_error(ent, limit, used, maximum)
