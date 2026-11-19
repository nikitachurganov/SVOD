import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, status

from app.api.deps import CurrentUser, DbSession
from app.core.client_ip import client_ip
from app.core.config import settings
from app.models.payment import PAYMENT_FAILED, PAYMENT_NEW, Payment
from app.constants import team_roles
from app.constants.billing_plans import TEAM_FREE_TOKENS
from app.repositories import organization_repository, payment_repository
from app.schemas.billing import (
    CheckoutRequest,
    CheckoutResponse,
    PaymentInfo,
    PlanRequestCreate,
    PlanRequestInfo,
    PlansResponse,
    QuoteResponse,
    SeatAdditionQuoteResponse,
    SeatsRequest,
    SubscriptionHistoryItem,
    SubscriptionResponse,
    TeamBillingSummary,
    TeamCheckoutRequest,
    TeamPaymentInfo,
)
from app.services import (
    billing_service,
    payment_service,
    plan_request_service,
    team_billing_service,
    yookassa_client,
)
from app.services import subscription_lifecycle_service as lifecycle

logger = logging.getLogger(__name__)

router = APIRouter()

PAYMENT_HISTORY_LIMIT = 20


def _require_billing() -> None:
    if not settings.BILLING_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail={"code": "billing_disabled"}
        )


def _team_model_on() -> bool:
    return settings.BILLING_ENABLED and settings.TEAM_BILLING_ENABLED


def _require_person_model() -> None:
    """The purchases of a person (the old plans, seats, add-on packs, the trial) are closed once the
    plans belong to teams: everything is bought for a team through /teams/{id}/checkout."""
    _require_billing()
    if _team_model_on():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "team_billing_enabled",
                "message": "Тарифы теперь подключаются для команды: откройте страницу «Тарифы».",
            },
        )


@router.get("/plans", response_model=PlansResponse)
async def get_plans() -> PlansResponse:
    response = billing_service.build_plans_response()
    if _team_model_on():
        response.team_billing_enabled = True
        response.team_offers = team_billing_service.offers()
        response.team_free_tokens = TEAM_FREE_TOKENS
        response.team_strong_models = list(team_billing_service.strong_models())
    return response


@router.get("/quote", response_model=QuoteResponse)
async def get_quote(
    term: str = Query(default="month", pattern="^(month|year)$"),
    seats: int = Query(default=1, ge=1, le=100),
) -> QuoteResponse:
    """The price of a team of ``seats`` seats for a month or a year, for the price page and the cart.
    Public like the plans; the price of a first purchase (both kit places at 300 ₽)."""
    if not settings.SEAT_PRICING_ENABLED or _team_model_on():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "seats_unavailable"}
        )
    try:
        return billing_service.build_quote_response(term, seats)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "invalid_seats"}
        ) from exc


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(session: DbSession, user: CurrentUser) -> SubscriptionResponse:
    return await billing_service.get_subscription_summary(session, user)


@router.get("/history", response_model=list[SubscriptionHistoryItem])
async def get_history(session: DbSession, user: CurrentUser) -> list[SubscriptionHistoryItem]:
    """What happened to the plan: paid, seats added, expired, refunded (the person's own journal)."""
    return await billing_service.get_history(session, user)


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    payload: CheckoutRequest, session: DbSession, user: CurrentUser
) -> CheckoutResponse:
    """Start paying for the paid plan online: the answer is the payment page to send the person to."""
    _require_person_model()
    payment = await payment_service.create_checkout(
        session, user, payload.term, seats=payload.seats, return_to=payload.return_to
    )
    if not payment.confirmation_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail={"code": "payment_provider_rejected"}
        )
    return CheckoutResponse(payment_id=payment.id, confirmation_url=payment.confirmation_url)


@router.get("/seats/quote", response_model=SeatAdditionQuoteResponse)
async def quote_seats(
    session: DbSession, user: CurrentUser, seats: int = Query(ge=2, le=100)
) -> SeatAdditionQuoteResponse:
    """The sum of adding seats now, to show before the person goes to pay; nothing is created."""
    _require_person_model()
    quote = await payment_service.quote_seat_addition(session, user, seats)
    return SeatAdditionQuoteResponse(
        seats=quote.seats, amount_kopecks=quote.amount_kopecks, days_left=quote.days_left
    )


@router.post("/seats", response_model=CheckoutResponse)
async def add_seats(payload: SeatsRequest, session: DbSession, user: CurrentUser) -> CheckoutResponse:
    """Pay for more seats in the middle of the period: the answer is the payment page."""
    _require_person_model()
    payment = await payment_service.create_seat_addition(
        session, user, payload.seats, return_to=payload.return_to
    )
    if not payment.confirmation_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail={"code": "payment_provider_rejected"}
        )
    return CheckoutResponse(payment_id=payment.id, confirmation_url=payment.confirmation_url)


@router.post("/addon", response_model=CheckoutResponse)
async def buy_addon(session: DbSession, user: CurrentUser) -> CheckoutResponse:
    """Buy the extra pack of Токены+ (1 million, 90 days): the answer is the payment page."""
    _require_person_model()
    payment = await payment_service.create_addon(session, user)
    if not payment.confirmation_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail={"code": "payment_provider_rejected"}
        )
    return CheckoutResponse(payment_id=payment.id, confirmation_url=payment.confirmation_url)


@router.get("/payments", response_model=list[PaymentInfo])
async def list_payments(session: DbSession, user: CurrentUser) -> list[Payment]:
    # Attempts that never reached the provider are the operator's business, not the person's history
    return await payment_repository.list_for_user(
        session, user.id, limit=PAYMENT_HISTORY_LIMIT, exclude_statuses=(PAYMENT_NEW, PAYMENT_FAILED)
    )


@router.get("/payments/{payment_id}", response_model=PaymentInfo)
async def get_payment(
    payment_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> Payment:
    """The state of one payment. A person coming back from the payment page polls this, and it asks the
    provider itself, so the plan appears at once even if the notification is late."""
    payment, settlement = await payment_service.refresh_for_user(session, user, payment_id)
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail={"code": "payment_not_found"}
        )
    await session.commit()
    background_tasks.add_task(payment_service.announce, settlement)
    return payment


@router.post("/webhooks/yookassa")
async def yookassa_webhook(
    request: Request, session: DbSession, background_tasks: BackgroundTasks
) -> dict[str, bool]:
    """Notifications of YooKassa. They are not trusted: the address is checked, and the payment they
    name is read from the API again before anything is granted."""
    if not settings.YOOKASSA_SHOP_ID.strip():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    sender = client_ip(request)
    if settings.YOOKASSA_VERIFY_WEBHOOK_IP and not yookassa_client.is_provider_address(sender):
        logger.warning("YooKassa notification from an unknown address %s", sender)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    try:
        body = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST) from exc
    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)
    try:
        settlement = await payment_service.handle_notification(session, body)
    except yookassa_client.ProviderUnavailable as exc:
        # Not 200: YooKassa repeats the notification for a day, and the worker settles it meanwhile
        logger.warning("Could not read the payment of a notification: %s", exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE) from exc
    except yookassa_client.ProviderError as exc:
        # The API refused (an id that is not ours, wrong credentials): repeating it will not help
        logger.error("The payment of a notification was refused by the API: %s", exc)
        return {"ok": True}
    await session.commit()
    background_tasks.add_task(payment_service.announce, settlement)
    return {"ok": True}


@router.post(
    "/plan-requests", response_model=PlanRequestInfo, status_code=status.HTTP_201_CREATED
)
async def create_plan_request(
    payload: PlanRequestCreate,
    session: DbSession,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> PlanRequestInfo:
    """Ask for a paid plan; an administrator activates it after the payment. One at a time."""
    if _team_model_on():
        _require_person_model()
    request = await plan_request_service.create_request(session, user, payload)
    await session.commit()
    background_tasks.add_task(plan_request_service.announce_to_admin, request, user)
    return PlanRequestInfo.model_validate(request, from_attributes=True)


# ─── The team model (docs/MONETIZATION_TEAM_SPEC.md) ──────────────────────────


def _require_team_billing() -> None:
    if not (settings.BILLING_ENABLED and settings.TEAM_BILLING_ENABLED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail={"code": "team_billing_disabled"}
        )


async def _team_member(session: DbSession, user: CurrentUser, organization_id: uuid.UUID):
    member = await organization_repository.get_member(session, organization_id, user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this organization"
        )
    return member


@router.get("/teams/{organization_id}", response_model=TeamBillingSummary)
async def get_team_billing(
    organization_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> TeamBillingSummary:
    """The plan, the two balances and the rights of one team, for the plans and the balance screens.
    The screen shows the team it was asked about, so a change of the active team changes the answer."""
    _require_team_billing()
    member = await _team_member(session, user, organization_id)
    state = await team_billing_service.get_state(session, organization_id)
    return team_billing_service.build_summary(
        organization_id, state, can_buy=team_roles.can_manage_billing(member.role_tag)
    )


@router.post("/teams/{organization_id}/checkout", response_model=CheckoutResponse)
async def create_team_checkout(
    organization_id: uuid.UUID,
    payload: TeamCheckoutRequest,
    session: DbSession,
    user: CurrentUser,
) -> CheckoutResponse:
    """Pay for the pack or a month of a plan, for this team only: the answer is the payment page."""
    _require_team_billing()
    payment = await payment_service.create_team_checkout(
        session, user, organization_id, payload.kind, return_to=payload.return_to
    )
    if not payment.confirmation_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail={"code": "payment_provider_rejected"}
        )
    return CheckoutResponse(payment_id=payment.id, confirmation_url=payment.confirmation_url)


@router.get("/teams/{organization_id}/payments", response_model=list[TeamPaymentInfo])
async def list_team_payments(
    organization_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> list[Payment]:
    """The purchases of the team that went through. Who may see the history is not decided yet (spec,
    section 6, item 5), so it is the owner who does."""
    _require_team_billing()
    member = await _team_member(session, user, organization_id)
    if not team_roles.can_manage_billing(member.role_tag):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "billing_forbidden"})
    return await payment_repository.list_for_organization(
        session, organization_id, limit=PAYMENT_HISTORY_LIMIT
    )


@router.post("/trial", response_model=SubscriptionResponse)
async def start_trial(session: DbSession, user: CurrentUser) -> SubscriptionResponse:
    """The free trial of the paid plan: once per person, with a confirmed mailbox."""
    _require_person_model()
    await lifecycle.start_trial(session, user)
    await session.commit()
    return await billing_service.get_subscription_summary(session, user)


@router.post("/cancel", response_model=SubscriptionResponse)
async def cancel_subscription(session: DbSession, user: CurrentUser) -> SubscriptionResponse:
    """Do not renew: the plan works until the end of the period that is paid for."""
    _require_billing()
    await lifecycle.cancel(session, user.id)
    await session.commit()
    return await billing_service.get_subscription_summary(session, user)


@router.post("/resume", response_model=SubscriptionResponse)
async def resume_subscription(session: DbSession, user: CurrentUser) -> SubscriptionResponse:
    """Take the cancellation back (not while the account is scheduled for deletion)."""
    _require_billing()
    await lifecycle.resume(session, user)
    await session.commit()
    return await billing_service.get_subscription_summary(session, user)
