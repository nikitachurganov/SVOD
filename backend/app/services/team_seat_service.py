"""Seats of a team: who takes one, and whether one more person fits.

A seat is taken by the owner, the admins and the editors, and also by an invitation that has not
been answered yet (otherwise a team could invite more people than it pays for and let them all in
later). A reader takes no seat, but there are at most MAX_READERS_PER_TEAM of them.

The seats belong to the owner's subscription, so they are shared by all the teams the owner has in
one service: a person is counted once however many of those teams they work in, and a second team
gives no second set of seats. Readers are still counted per team.

The paid places come from the plan of the team owner (Entitlements.seats). The rule follows the
same switches as every other plan limit: with BILLING_ENABLED off nothing is checked; in shadow
mode (BILLING_ENFORCE off) a broken rule is only counted in svod_billing_limit_hit_total; when
enforced it refuses with 402 limit_reached.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import METRIC_AI_TOKENS, PLAN_START
from app.constants.team_roles import MAX_READERS_PER_TEAM, takes_seat
from app.core.config import settings
from app.core.metrics import BILLING_LIMIT_HIT
from app.models.organization import Organization
from app.repositories import billing_repository, organization_repository
from app.services import billing_service, seat_window, team_billing_service

LIMIT_SEATS = "seats"
LIMIT_READERS = "readers"

INVITATION_PENDING = "pending"


@dataclass(frozen=True)
class SeatUsage:
    seats_used: int
    readers: int
    seats_limit: int
    # Of seats_used: people who hold a seat only in the owner's other teams
    seats_elsewhere: int = 0
    # Who holds a seat in any of the owner's teams ("u:<user id>" or "e:<email>" of an invitation)
    holders: frozenset[str] = frozenset()


@dataclass(frozen=True)
class Place:
    """One person (or unanswered invitation) in one of the owner's teams."""

    org_id: uuid.UUID
    key: str
    role: str | None


def person_key(user_id: uuid.UUID | None, email: str | None = None) -> str:
    return f"u:{user_id}" if user_id is not None else f"e:{(email or '').strip().lower()}"


def tally(places: Iterable[Place], org_id: uuid.UUID, seats_limit: int) -> SeatUsage:
    """Seats over all the owner's teams (each person once), readers of this team only."""
    places = list(places)
    holders = {p.key for p in places if takes_seat(p.role)}
    here = {p.key for p in places if p.org_id == org_id and takes_seat(p.role)}
    readers = sum(1 for p in places if p.org_id == org_id and not takes_seat(p.role))
    return SeatUsage(len(holders), readers, seats_limit, len(holders - here), frozenset(holders))


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
        return replace(usage, seats_used=max(usage.seats_used - 1, 0))
    return replace(usage, readers=max(usage.readers - 1, 0))


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


@dataclass(frozen=True)
class TeamAiQuota:
    """The team's shared pool of Токены+ and what each person took from it in this period."""

    pool_used: int | None = None
    pool_max: int | None = None
    resets_at: datetime | None = None
    spent_by_user: dict[str, int] = field(default_factory=dict)
    seat_window_days_left: int = 0


async def ai_quota_for_org(
    session: AsyncSession, org: Organization, ent: billing_service.Entitlements
) -> TeamAiQuota:
    """The pool of the owner's plan: used and total, when it renews, and the spending of each member.

    A team whose owner is on the free plan has no pool (everybody spends their own allowance, see
    ai_pool.py), so only the seat window is reported for it.
    """
    if settings.BILLING_ENABLED and settings.TEAM_BILLING_ENABLED:
        # The team model: the pool is the quota of the paid month of this team, apart from its packs
        state = await team_billing_service.get_state(session, org.id)
        if state.plan is None:
            return TeamAiQuota()
        spent = await billing_repository.charged_tokens_by_user(session, org.id, state.period_start)
        return TeamAiQuota(
            pool_used=state.plan.quota_tokens - state.plan_tokens,
            pool_max=state.plan.quota_tokens,
            resets_at=state.period_end,
            spent_by_user={str(user_id): tokens for user_id, tokens in spent.items()},
        )
    window_left = seat_window.days_left(ent, datetime.now(timezone.utc))
    if not ent.billing_enabled or ent.plan.code == PLAN_START:
        return TeamAiQuota(seat_window_days_left=window_left)
    counters = await billing_repository.get_usage(session, org.owner_user_id, ent.ai_window_start)
    spent = await billing_repository.charged_tokens_by_user(session, org.id, ent.ai_window_start)
    return TeamAiQuota(
        pool_used=counters.get(METRIC_AI_TOKENS, 0),
        pool_max=ent.plan.ai_tokens_per_period,
        resets_at=ent.ai_window_end,
        spent_by_user={str(user_id): tokens for user_id, tokens in spent.items()},
        seat_window_days_left=window_left,
    )


async def usage_for_org(
    session: AsyncSession, org: Organization
) -> tuple[SeatUsage, billing_service.Entitlements]:
    """Places and readers in use now (members and unanswered invitations), with the plan.

    Seats are counted over every team of the owner in the same service; readers in this team only.
    """
    if settings.BILLING_ENABLED and settings.TEAM_BILLING_ENABLED:
        # The team model: the seats are the team's own, nothing is shared with the owner's other teams
        ent = await team_billing_service.entitlements(session, org.id)
        teams = [org]
    else:
        ent = await billing_service.get_entitlements(session, org.owner_user_id)
        teams = await organization_repository.list_owned_teams(
            session, org.owner_user_id, getattr(org, "service", None)
        )
        if all(team.id != org.id for team in teams):
            teams.append(org)
    places: list[Place] = []
    for team in teams:
        for member in await organization_repository.list_members(session, team.id):
            places.append(Place(team.id, person_key(member.user_id), member.role_tag))
        for inv in await organization_repository.list_invitations(session, team.id):
            if inv.status == INVITATION_PENDING:
                key = person_key(getattr(inv, "invited_user_id", None), inv.email)
                places.append(Place(team.id, key, inv.role_tag))
    return tally(places, org.id, ent.seats), ent


async def ensure_room(
    session: AsyncSession,
    org: Organization,
    role: str | None,
    *,
    replacing_role: str | None = None,
    already_counted: bool = False,
    person: uuid.UUID | None = None,
) -> None:
    """Refuse (when enforced) adding a person with ``role`` to a team that has no room for them.

    ``replacing_role`` is the current role of a person who stays and only changes role: they are
    taken out of the count first. ``already_counted`` is for accepting an invitation, which
    already holds its place as a pending invitation. ``person`` is the user being added: one who
    already holds a seat in this or another team of the owner takes no new one.
    """
    usage, ent = await usage_for_org(session, org)
    if not ent.billing_enabled:
        return
    if person is not None and takes_seat(role) and person_key(person) in usage.holders:
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
