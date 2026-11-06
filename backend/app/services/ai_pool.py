"""Whose tokens an AI action spends: the team pool, a member's personal cap, the weight of a token.

A team that is paid for has one pool of Токены+: the counter of the team owner (the plan is the
owner's). An editor, an admin or the owner who acts inside such a team spends from it. A member can
be given a personal cap by the owner; it is counted next to the pool and stops that one person
when it runs out, the pool stays for the others. A reader never spends AI.

If the team owner is on the free plan, the acting person spends their own allowance, as before
teams existed: the free allowance is personal (docs/TARIFFS_FINAL.md §2).

Not here yet: the order of several balances (monthly seat quota, referral bonus, add-on pack, pack)
and the safety fuse at 60 % / 90 % of the period revenue. They come with the stages that bring
those balances and the revenue per team.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import team_roles
from app.constants.billing_plans import PLAN_START, Plan
from app.core.config import settings
from app.models.user import User
from app.repositories import organization_repository
from app.services import billing_service

# The usage counter of a member's personal cap lives under the member, one per team
_MEMBER_METRIC_PREFIX = "aim:"


def member_metric(organization_id: uuid.UUID) -> str:
    """Counter name for a member's cap in one team (the column is 32 characters long)."""
    return _MEMBER_METRIC_PREFIX + organization_id.hex[:27]


@dataclass(frozen=True)
class MemberCap:
    user_id: uuid.UUID
    organization_id: uuid.UUID
    limit: int

    @property
    def metric(self) -> str:
        return member_metric(self.organization_id)


@dataclass(frozen=True)
class Payer:
    """Whose counter is charged for an action."""

    user_id: uuid.UUID
    organization_id: uuid.UUID | None
    # The personal cap of the person who acts; None when they have none
    cap: MemberCap | None = None
    # True: the counter is the team owner's pool, not the acting person's own allowance
    pooled: bool = False


def charged_tokens(tokens: int, model: str | None, plan: Plan) -> int:
    """Токены+ charged for the tokens a model really used.

    The base model counts with the plan's weight, any other model one to one. A started action
    always costs at least one.
    """
    if tokens <= 0:
        return 0
    weight = plan.base_model_weight if model in (None, settings.OPENROUTER_MODEL) else 1.0
    # round() first: 5 * 0.2 is 1.0000000000000002 and must not become 2
    return max(1, math.ceil(round(tokens * weight, 6)))


async def resolve_payer(
    session: AsyncSession, user: User, organization_id: uuid.UUID | None
) -> Payer:
    """The counter an action of ``user`` inside ``organization_id`` is charged to.

    Without an organization, in a personal workspace, as the owner, or in a team whose owner is on
    the free plan, it is the user's own counter. Otherwise it is the pool of the team owner.
    A reader is refused: the AI spends the team's tokens.
    """
    own = Payer(user_id=user.id, organization_id=organization_id)
    if organization_id is None:
        return own

    org = await organization_repository.get_org_by_id(session, organization_id)
    member = await organization_repository.get_member(session, organization_id, user.id)
    if org is None or member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this organization"
        )
    if not team_roles.can_edit(member.role_tag):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ai_forbidden_for_reader",
                "message": "Читатель не может пользоваться ИИ. Попросите владельца сменить роль.",
            },
        )
    if org.is_personal or org.owner_user_id == user.id:
        return own

    owner_ent = await billing_service.get_entitlements(session, org.owner_user_id)
    if not owner_ent.billing_enabled or owner_ent.plan.code == PLAN_START:
        return own

    cap = None
    if member.token_plus_limit is not None:
        cap = MemberCap(user.id, organization_id, max(int(member.token_plus_limit), 0))
    return Payer(user_id=org.owner_user_id, organization_id=organization_id, cap=cap, pooled=True)
