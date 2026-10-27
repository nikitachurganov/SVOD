import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status

from app.api.deps import CurrentUser, DbSession
from app.core.client_ip import client_ip
from app.core.config import settings
from app.models.payment import PAYMENT_FAILED, PAYMENT_NEW, Payment
from app.repositories import payment_repository
from app.schemas.billing import (
    CheckoutRequest,
    CheckoutResponse,
    PaymentInfo,
    PlanRequestCreate,
    PlanRequestInfo,
    PlansResponse,
    SubscriptionResponse,
)
from app.services import billing_service, payment_service, plan_request_service, yookassa_client
from app.services import subscription_lifecycle_service as lifecycle

logger = logging.getLogger(__name__)

router = APIRouter()

PAYMENT_HISTORY_LIMIT = 20


def _require_billing() -> None:
    if not settings.BILLING_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail={"code": "billing_disabled"}
        )


@router.get("/plans", response_model=PlansResponse)
async def get_plans() -> PlansResponse:
    return billing_service.build_plans_response()


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(session: DbSession, user: CurrentUser) -> SubscriptionResponse:
    return await billing_service.get_subscription_summary(session, user)


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    payload: CheckoutRequest, session: DbSession, user: CurrentUser
) -> CheckoutResponse:
    """Start paying for the paid plan online: the answer is the payment page to send the person to."""
    _require_billing()
    payment = await payment_service.create_checkout(session, user, payload.term)
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
    request = await plan_request_service.create_request(session, user, payload)
    await session.commit()
    background_tasks.add_task(plan_request_service.announce_to_admin, request, user)
    return PlanRequestInfo.model_validate(request, from_attributes=True)


@router.post("/trial", response_model=SubscriptionResponse)
async def start_trial(session: DbSession, user: CurrentUser) -> SubscriptionResponse:
    """The free trial of the paid plan: once per person, with a confirmed mailbox."""
    _require_billing()
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
