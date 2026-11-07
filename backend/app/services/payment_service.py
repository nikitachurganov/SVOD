"""Online payment of a plan through YooKassa.

The rule that keeps the money safe: a payment is settled from what the provider's API says about it,
never from what a notification (or a person's return to the site) claims. A notification only tells us
*which* payment to look at. Settling is idempotent: the row is locked, ``applied_at`` is set once, so
a repeated notification, a parallel poll of the worker and a person refreshing the page extend the
plan exactly once.

``create_checkout`` commits by itself, because the provider is called over the network between two
commits and no transaction may be held open meanwhile. The rest does not commit; the caller does.
"""

from __future__ import annotations

import logging
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import (
    ADDON_DAYS,
    ADDON_PRICE_KOPECKS,
    ADDON_TOKENS,
    INTERVAL_MONTH,
    INTERVAL_ONE_OFF,
    INTERVAL_YEAR,
    PACK_PRICE_KOPECKS,
    PLAN_PACK,
    PLAN_RESEARCHER,
    Plan,
    get_plan,
)
from app.core.config import settings
from app.core.metrics import PAYMENTS
from app.models.payment import (
    OPEN_STATUSES,
    PAYMENT_CANCELED,
    PAYMENT_FAILED,
    PAYMENT_MISMATCH,
    PAYMENT_NEW,
    PAYMENT_PENDING,
    PAYMENT_SUCCEEDED,
    PROVIDER_YOOKASSA,
    Payment,
)
from app.models.plan_request import PLAN_REQUEST_APPROVED
from app.models.subscription import Subscription
from app.models.token_grant import GRANT_ADDON, TokenGrant
from app.models.user import User
from app.repositories import (
    billing_repository,
    payment_repository,
    plan_request_repository,
    token_grant_repository,
    user_repository,
)
from app.services import billing_mail, billing_service, pricing, seat_window, yookassa_client
from app.services import subscription_lifecycle_service as lifecycle
from app.services.plan_request_service import DAYS_BY_INTERVAL

logger = logging.getLogger(__name__)

# The term of a payment that only adds seats to the running period (it extends nothing)
TERM_SEATS_ADD = "seats_add"
# The extra pack of Токены+: it is its own kind of payment and has no plan of its own
TERM_ADDON = "addon"
PLAN_CODE_ADDON = "addon"

EVENT_PAYMENT_SUCCEEDED = "payment_succeeded"
EVENT_PAYMENT_CANCELED = "payment_canceled"
EVENT_PAYMENT_REFUNDED = "payment_refunded"
EVENT_PAYMENT_MISMATCH = "payment_mismatch"

OUTCOME_APPLIED = "applied"
OUTCOME_CANCELED = "canceled"
OUTCOME_REFUNDED = "refunded"
OUTCOME_MISMATCH = "mismatch"
OUTCOME_UNCHANGED = "unchanged"

# A second click on «Оплатить» within this time returns the same page
REUSE_CHECKOUT_FOR = timedelta(minutes=30)
# Give the notification a moment to arrive before the worker asks the provider itself
RECONCILE_AFTER = timedelta(minutes=2)
# A payment the provider never answered for is written off after this long
NO_ANSWER_AFTER = timedelta(minutes=15)
RECONCILE_BATCH = 20

_TERM_TITLES = {
    INTERVAL_MONTH: "1 месяц",
    INTERVAL_YEAR: "1 год",
    INTERVAL_ONE_OFF: "разовый доступ",
}


@dataclass(frozen=True)
class Settlement:
    """What settling did, with what the caller needs to tell people about it after the commit."""

    outcome: str
    payment: Payment
    user: User | None = None
    subscription: Subscription | None = None
    # For a full refund: what was taken back (a ``lifecycle.REFUND_*`` value, "addon" for a pack
    # of tokens, REFUND_NOTHING when there was nothing to take); None for a partial one
    refund_effect: str | None = None


EFFECT_ADDON = "addon_revoked"


async def _take_back(
    session: AsyncSession, payment: Payment, now: datetime, *, whole_period: bool
) -> str:
    """The payment was refunded: take away what it gave. ``whole_period`` is for a refund of a part,
    which ends the paid period instead of subtracting the days of this payment."""
    if payment.term == TERM_ADDON:
        # What was spent from the pack stays spent
        revoked = await token_grant_repository.revoke_for_payment(session, payment.id, now)
        return EFFECT_ADDON if revoked else lifecycle.REFUND_NOTHING
    if payment.user_id is None:
        return lifecycle.REFUND_NOTHING
    return await lifecycle.revoke_for_refund(
        session,
        payment.user_id,
        plan_code=payment.plan_code,
        seats_added=payment.term == TERM_SEATS_ADD,
        days=payment.days,
        payment_id=payment.id,
        whole_period=whole_period,
        now=now,
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _error(status_code: int, code: str, message: str | None = None) -> HTTPException:
    detail: dict[str, str] = {"code": code}
    if message:
        detail["message"] = message
    return HTTPException(status_code=status_code, detail=detail)


def offer(
    term: str, seats: int = 1, kit_extra: int = pricing.KIT_EXTRA_SEATS
) -> tuple[Plan, int, int]:
    """(plan, price in kopecks, days) for the term, from the catalogue the server enforces.

    With SEAT_PRICING_ENABLED the Researcher price comes from ``pricing.quote`` for ``seats`` seats
    (``kit_extra`` is how many kit places still cost 300 ₽); without it there is one price per person
    and more than one seat is refused. The pack is always one seat at its own price.
    """
    plan = get_plan(PLAN_RESEARCHER)
    if term == INTERVAL_ONE_OFF:
        if seats != 1:
            raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_seats", "Пакет — одно место")
        return get_plan(PLAN_PACK), PACK_PRICE_KOPECKS, DAYS_BY_INTERVAL[term]
    if term not in (INTERVAL_MONTH, INTERVAL_YEAR):
        raise _error(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_term", "Неверный срок подключения")
    if settings.SEAT_PRICING_ENABLED:
        try:
            price = pricing.quote(seats, term, kit_extra=kit_extra).total_kopecks
        except ValueError as exc:
            raise _error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "invalid_seats",
                f"Число мест — от 1 до {pricing.MAX_SELF_SERVICE_SEATS}",
            ) from exc
    else:
        if seats != 1:
            raise _error(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "seats_unavailable", "Оплата по местам пока недоступна"
            )
        price = plan.price_month_kopecks if term == INTERVAL_MONTH else plan.price_year_kopecks
    return plan, price, DAYS_BY_INTERVAL[term]


def _return_url(payment_id: uuid.UUID) -> str:
    base = (settings.SURVEYS_APP_PUBLIC_URL.strip() or settings.APP_PUBLIC_URL.strip()).rstrip("/")
    url = settings.YOOKASSA_RETURN_URL.strip() or f"{base}/profile?tab=subscription"
    parts = urlsplit(url)
    query = [*parse_qsl(parts.query), ("payment", str(payment_id))]
    return urlunsplit(parts._replace(query=urlencode(query)))


async def _journal(
    session: AsyncSession, user_id: uuid.UUID | None, kind: str, payload: dict, now: datetime
) -> None:
    if user_id is None:
        return
    sub = await billing_service.ensure_subscription(session, user_id, now)
    await billing_repository.add_event(session, subscription_id=sub.id, kind=kind, payload=payload)


# ─── Starting a payment ───────────────────────────────────────────────────────


async def create_checkout(
    session: AsyncSession, user: User, term: str, now: datetime | None = None, *, seats: int = 1
) -> Payment:
    """Create the payment at the provider and return the row with the page to send the person to."""
    if not settings.payments_enabled:
        raise _error(status.HTTP_409_CONFLICT, "payments_disabled", "Онлайн-оплата пока не подключена")
    now = now or _now()
    kit_extra = pricing.KIT_EXTRA_SEATS
    if settings.SEAT_PRICING_ENABLED and term in (INTERVAL_MONTH, INTERVAL_YEAR):
        # A team that gave up a kit place pays the plain price for it when it comes back
        sub = await billing_service.ensure_subscription(session, user.id, now)
        kit_extra = seat_window.kit_extra_for(sub, now)
    plan, amount, days = offer(term, seats, kit_extra)

    if plan.code == PLAN_PACK:
        # The pack would replace a running subscription that gives far more: do not sell it
        paid = await lifecycle.active_paid_subscription(session, user.id, now)
        if paid is not None and paid.plan_code == PLAN_RESEARCHER:
            raise _error(
                status.HTTP_409_CONFLICT,
                "already_subscribed",
                "У вас уже действует тариф «Исследователь»",
            )

    description = f"Тариф «{plan.title}»: {_TERM_TITLES[term]}" + (f", мест: {seats}" if seats > 1 else "")
    return await _open_payment(session, user, plan.code, term, days, seats, amount, description, now)


@dataclass(frozen=True)
class SeatAdditionQuote:
    """What more seats cost in the middle of the period: the sum and the days it is counted for."""

    seats: int
    amount_kopecks: int
    days_left: int


async def quote_seat_addition(
    session: AsyncSession, user: User, seats: int, now: datetime | None = None
) -> SeatAdditionQuote:
    """The price of a team of ``seats`` seats for the rest of the paid period (nothing is stored).

    The same numbers the payment is made for: ``create_seat_addition`` takes its amount from here.
    """
    if not settings.SEAT_PRICING_ENABLED:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "seats_unavailable", "Оплата по местам пока недоступна"
        )
    now = now or _now()
    sub = await lifecycle.active_paid_subscription(session, user.id, now)
    if sub is None or sub.plan_code != PLAN_RESEARCHER:
        raise _error(
            status.HTTP_409_CONFLICT, "no_active_subscription", "Места добавляются к тарифу «Исследователь»"
        )
    if sub.billing_interval not in (INTERVAL_MONTH, INTERVAL_YEAR):
        # Given by hand for a term in days: there is no price list for it, an operator sets it
        raise _error(
            status.HTTP_409_CONFLICT, "seats_by_request", "Для этого тарифа места добавляет поддержка"
        )
    if not sub.seats_count < seats <= pricing.MAX_SELF_SERVICE_SEATS:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "invalid_seats",
            f"Число мест — больше {sub.seats_count} и не больше {pricing.MAX_SELF_SERVICE_SEATS}",
        )
    period_days = DAYS_BY_INTERVAL[sub.billing_interval]
    # A started day is paid as a whole day; a period paid ahead is charged for one nominal period only
    days_left = min(period_days, max(1, -((now - sub.current_period_end) // timedelta(days=1))))
    kit_extra = seat_window.kit_extra_for(sub, now)
    amount = pricing.seat_addition(
        sub.seats_count,
        seats,
        sub.billing_interval,
        days_left=days_left,
        period_days=period_days,
        kit_extra_now=kit_extra,
        kit_extra_after=kit_extra,
    )
    if amount <= 0:
        raise _error(status.HTTP_409_CONFLICT, "nothing_to_pay", "Доплата не нужна")
    return SeatAdditionQuote(seats=seats, amount_kopecks=amount, days_left=days_left)


async def create_seat_addition(
    session: AsyncSession, user: User, seats: int, now: datetime | None = None
) -> Payment:
    """Pay for more seats in the middle of a period: the price of the new seats for the days that are
    left. The period itself does not change; the seats appear when the payment is settled."""
    if not settings.payments_enabled:
        raise _error(status.HTTP_409_CONFLICT, "payments_disabled", "Онлайн-оплата пока не подключена")
    now = now or _now()
    quote = await quote_seat_addition(session, user, seats, now)
    plan = get_plan(PLAN_RESEARCHER)
    description = f"Тариф «{plan.title}»: места до {seats}, дней в периоде: {quote.days_left}"
    return await _open_payment(
        session, user, plan.code, TERM_SEATS_ADD, quote.days_left, seats, quote.amount_kopecks, description, now
    )


async def create_addon(session: AsyncSession, user: User, now: datetime | None = None) -> Payment:
    """Buy the extra pack of Токены+: 1 million for 300 ₽, valid 90 days, only on top of a running
    subscription or pack. The tokens appear when the payment is settled."""
    if not settings.payments_enabled:
        raise _error(status.HTTP_409_CONFLICT, "payments_disabled", "Онлайн-оплата пока не подключена")
    if not settings.SEAT_PRICING_ENABLED:
        raise _error(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "addon_unavailable", "Дополнительные пакеты пока недоступны"
        )
    now = now or _now()
    if await lifecycle.active_paid_subscription(session, user.id, now) is None:
        raise _error(
            status.HTTP_409_CONFLICT,
            "no_active_subscription",
            "Пакет докупается к действующему тарифу или пакету «Исследование»",
        )
    return await _open_payment(
        session,
        user,
        PLAN_CODE_ADDON,
        TERM_ADDON,
        ADDON_DAYS,
        1,
        ADDON_PRICE_KOPECKS,
        "Дополнительный пакет: 1 000 000 Токенов+, 90 дней",
        now,
    )


async def _open_payment(
    session: AsyncSession,
    user: User,
    plan_code: str,
    term: str,
    days: int,
    seats: int,
    amount: int,
    description: str,
    now: datetime,
) -> Payment:
    """Store the payment, then create it at the provider; a second click returns the same page."""
    existing = await payment_repository.find_open_checkout(
        session, user.id, term, seats=seats, since=now - REUSE_CHECKOUT_FOR
    )
    if existing is not None:
        return existing

    payment = await payment_repository.add(
        session,
        Payment(
            user_id=user.id,
            payer_email=user.email,
            provider=PROVIDER_YOOKASSA,
            idempotence_key=yookassa_client.new_idempotence_key(),
            plan_code=plan_code,
            term=term,
            days=days,
            seats=seats,
            amount_kopecks=amount,
            status=PAYMENT_NEW,
            created_at=now,
        ),
    )
    # The row exists before the provider hears of it: a crash in between leaves a trace to settle from
    await session.commit()

    try:
        created = await yookassa_client.create_payment(
            idempotence_key=payment.idempotence_key,
            amount_kopecks=amount,
            description=description,
            return_url=_return_url(payment.id),
            metadata={"payment_id": str(payment.id), "user_id": str(user.id)},
        )
    except yookassa_client.ProviderUnavailable as exc:
        logger.warning("YooKassa is unavailable, payment %s was not created: %s", payment.id, exc)
        payment.status, payment.failure_reason = PAYMENT_FAILED, "provider_unavailable"
        await session.commit()
        PAYMENTS.labels("provider_error").inc()
        raise _error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "payment_provider_unavailable",
            "Платёжный сервис сейчас недоступен. Попробуйте через несколько минут.",
        ) from exc
    except yookassa_client.ProviderError as exc:
        # Usually the shop settings (credentials, a method not enabled): the operator has to look
        logger.error("YooKassa refused to create payment %s: %s", payment.id, exc)
        payment.status, payment.failure_reason = PAYMENT_FAILED, "provider_rejected"
        await session.commit()
        PAYMENTS.labels("provider_error").inc()
        raise _error(
            status.HTTP_502_BAD_GATEWAY,
            "payment_provider_rejected",
            "Не удалось создать платёж. Оставьте заявку, и мы выставим счёт.",
        ) from exc

    payment.provider_payment_id = created.id
    payment.status = PAYMENT_PENDING
    payment.confirmation_url = created.confirmation_url
    payment.is_test = created.is_test
    await session.commit()
    PAYMENTS.labels("created").inc()
    return payment


# ─── Settling a payment from the provider's data ──────────────────────────────


async def _close_plan_request(session: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    """A person who paid does not need an administrator to activate the request they left earlier."""
    pending = await plan_request_repository.get_pending_for_user(session, user_id)
    if pending is not None:
        pending.status = PLAN_REQUEST_APPROVED
        pending.processed_at = now
        pending.decision_note = "Оплачено онлайн"


async def _apply(
    session: AsyncSession, payment: Payment, provider: yookassa_client.ProviderPayment, now: datetime
) -> Settlement:
    """Bring the locked row in line with the provider's payment. Safe to run any number of times."""
    user = (
        await user_repository.get_by_id(session, payment.user_id) if payment.user_id else None
    )

    if provider.amount_kopecks != payment.amount_kopecks or provider.currency != payment.currency:
        if payment.status != PAYMENT_MISMATCH and payment.applied_at is None:
            logger.error(
                "Payment %s: the provider has %s %s, we asked for %s kopecks",
                payment.id,
                provider.amount_kopecks,
                provider.currency,
                payment.amount_kopecks,
            )
            payment.status = PAYMENT_MISMATCH
            payment.failure_reason = "amount_mismatch"
            await _journal(
                session,
                payment.user_id,
                EVENT_PAYMENT_MISMATCH,
                {"payment_id": str(payment.id), "provider_kopecks": provider.amount_kopecks},
                now,
            )
            PAYMENTS.labels("mismatch").inc()
            return Settlement(OUTCOME_MISMATCH, payment, user)
        return Settlement(OUTCOME_UNCHANGED, payment, user)

    if provider.status == yookassa_client.STATUS_SUCCEEDED and provider.paid:
        if payment.applied_at is None:
            payment.status = PAYMENT_SUCCEEDED
            payment.paid_at = payment.paid_at or now
            payment.is_test = provider.is_test
            if user is None:
                # Paid, but the account is gone: nothing to extend. The money has to go back by hand.
                payment.failure_reason = "no_account"
                logger.error("Payment %s succeeded but its account no longer exists", payment.id)
                PAYMENTS.labels("succeeded").inc()
                return Settlement(OUTCOME_UNCHANGED, payment, None)
            if payment.term == TERM_ADDON:
                # Nothing of the subscription changes: a block of Токенов+ with its own expiry
                await token_grant_repository.add(
                    session,
                    TokenGrant(
                        user_id=user.id,
                        kind=GRANT_ADDON,
                        amount=ADDON_TOKENS,
                        expires_at=now + timedelta(days=ADDON_DAYS),
                        payment_id=payment.id,
                        created_at=now,
                    ),
                )
                payment.applied_at = now
                await _journal(
                    session,
                    user.id,
                    EVENT_PAYMENT_SUCCEEDED,
                    {
                        "payment_id": str(payment.id),
                        "amount_kopecks": payment.amount_kopecks,
                        "term": payment.term,
                        "days": payment.days,
                        "test": payment.is_test,
                    },
                    now,
                )
                PAYMENTS.labels("succeeded").inc()
                return Settlement(OUTCOME_APPLIED, payment, user)
            try:
                if payment.term == TERM_SEATS_ADD:
                    sub = await lifecycle.add_seats(
                        session, user.id, payment.seats, note=f"Оплата {payment.id}", now=now
                    )
                else:
                    sub = await lifecycle.grant(
                        session,
                        user.id,
                        payment.plan_code,
                        days=payment.days,
                        interval=payment.term,
                        seats=payment.seats if payment.plan_code == PLAN_RESEARCHER else None,
                        note=f"Оплата {payment.id}",
                        now=now,
                    )
            except ValueError as exc:
                # Paid, but the plan cannot be given (e.g. a pack bought while a subscription
                # started in the meantime): the money has to go back by hand
                payment.failure_reason = "grant_failed"
                logger.error("Payment %s succeeded but could not be applied: %s", payment.id, exc)
                PAYMENTS.labels("succeeded").inc()
                return Settlement(OUTCOME_UNCHANGED, payment, user)
            payment.applied_at = now
            await _journal(
                session,
                user.id,
                EVENT_PAYMENT_SUCCEEDED,
                {
                    "payment_id": str(payment.id),
                    "amount_kopecks": payment.amount_kopecks,
                    "term": payment.term,
                    "days": payment.days,
                    "test": payment.is_test,
                },
                now,
            )
            await _close_plan_request(session, user.id, now)
            PAYMENTS.labels("succeeded").inc()
            return Settlement(OUTCOME_APPLIED, payment, user, sub)

        if provider.refunded_kopecks > payment.refunded_kopecks:
            first_refund = payment.refunded_kopecks == 0
            was_full = payment.refunded_kopecks >= payment.amount_kopecks
            payment.refunded_kopecks = provider.refunded_kopecks
            payment.refunded_at = now
            full_now = not was_full and payment.refunded_kopecks >= payment.amount_kopecks
            effect: str | None = None
            # What the money bought goes back with it, once. A plan or seats: at the first refund,
            # whatever its size (the refund terms, 4.1: a refund for the unused period ends the plan;
            # a full one takes exactly the days this payment gave). A pack of tokens: only a full one.
            if (full_now if payment.term == TERM_ADDON else first_refund):
                effect = await _take_back(session, payment, now, whole_period=not full_now)
            await _journal(
                session,
                payment.user_id,
                EVENT_PAYMENT_REFUNDED,
                {
                    "payment_id": str(payment.id),
                    "refunded_kopecks": provider.refunded_kopecks,
                    "effect": effect,
                },
                now,
            )
            PAYMENTS.labels("refunded").inc()
            return Settlement(OUTCOME_REFUNDED, payment, user, refund_effect=effect)
        return Settlement(OUTCOME_UNCHANGED, payment, user)

    if provider.status == yookassa_client.STATUS_CANCELED and payment.status in OPEN_STATUSES:
        payment.status = PAYMENT_CANCELED
        payment.failure_reason = (provider.cancel_reason or "canceled")[:100]
        await _journal(
            session,
            payment.user_id,
            EVENT_PAYMENT_CANCELED,
            {"payment_id": str(payment.id), "reason": payment.failure_reason},
            now,
        )
        PAYMENTS.labels("canceled").inc()
        return Settlement(OUTCOME_CANCELED, payment, user)

    return Settlement(OUTCOME_UNCHANGED, payment, user)


async def settle(
    session: AsyncSession, provider: yookassa_client.ProviderPayment, now: datetime | None = None
) -> Settlement | None:
    """Settle our row of the provider's payment; None when the payment is not one of ours."""
    payment = await payment_repository.get_by_provider_id(
        session, PROVIDER_YOOKASSA, provider.id, for_update=True
    )
    if payment is None:
        logger.warning("YooKassa payment %s is not in our records, ignored", provider.id)
        return None
    return await _apply(session, payment, provider, now or _now())


_PAYMENT_EVENTS = ("payment.succeeded", "payment.canceled")


async def handle_notification(
    session: AsyncSession, body: dict, now: datetime | None = None
) -> Settlement | None:
    """A notification says which payment changed; the payment itself is read from the API.

    Raises ``ProviderUnavailable`` when the API cannot be asked: the route then answers with an error
    and YooKassa repeats the notification for a day.
    """
    if body.get("type") != "notification":
        return None
    event = body.get("event")
    obj = body.get("object")
    if not isinstance(obj, dict):
        return None
    if event in _PAYMENT_EVENTS:
        provider_id = obj.get("id")
    elif event == "refund.succeeded":
        provider_id = obj.get("payment_id")
    else:
        return None
    if not isinstance(provider_id, str) or not provider_id:
        return None
    return await settle(session, await yookassa_client.get_payment(provider_id), now)


async def refresh_for_user(
    session: AsyncSession, user: User, payment_id: uuid.UUID, now: datetime | None = None
) -> tuple[Payment | None, Settlement | None]:
    """The person came back from the payment page: ask the provider now instead of waiting for the
    notification. A provider that cannot be reached just leaves the state as it is."""
    payment = await payment_repository.get_for_user(session, user.id, payment_id)
    if payment is None:
        return None, None
    if payment.status not in OPEN_STATUSES or not payment.provider_payment_id:
        return payment, None
    try:
        provider = await yookassa_client.get_payment(payment.provider_payment_id)
    except yookassa_client.ProviderError as exc:
        logger.warning("Could not refresh payment %s: %s", payment.id, exc)
        return payment, None
    settlement = await settle(session, provider, now)
    return (settlement.payment if settlement else payment), settlement


# ─── What is told to whom after the commit ────────────────────────────────────


async def announce(settlement: Settlement | None) -> None:
    """Emails for a settled payment; run after the commit. Never raises."""
    if settlement is None:
        return
    plan = get_plan(settlement.payment.plan_code)
    if settlement.outcome == OUTCOME_APPLIED and settlement.user and settlement.subscription:
        await lifecycle.deliver(
            billing_mail.send_plan_granted(
                settlement.user, plan.title, settlement.subscription.current_period_end
            )
        )
    elif settlement.outcome in (OUTCOME_REFUNDED, OUTCOME_MISMATCH):
        to = settings.ADMIN_NOTIFY_EMAIL.strip()
        if to:
            await lifecycle.deliver(
                billing_mail.send_payment_alert_to_admin(
                    to=to,
                    outcome=settlement.outcome,
                    payment_id=str(settlement.payment.id),
                    email=settlement.payment.payer_email,
                    amount_kopecks=settlement.payment.amount_kopecks,
                    refunded_kopecks=settlement.payment.refunded_kopecks,
                    effect=settlement.refund_effect,
                )
            )


# ─── The worker: payments no notification settled ─────────────────────────────


async def reconcile_open(session: AsyncSession, now: datetime | None = None) -> Counter[str]:
    """Ask the provider about the payments that are still open: a lost notification must not leave a
    person who paid without the plan. Commits after every payment, so one failure harms nobody."""
    now = now or _now()
    done: Counter[str] = Counter()
    if not settings.YOOKASSA_SHOP_ID.strip():
        return done
    ids = await payment_repository.list_open_ids(
        session,
        older_than=now - RECONCILE_AFTER,
        newer_than=now - timedelta(hours=settings.PAYMENT_PENDING_GIVE_UP_HOURS),
        limit=RECONCILE_BATCH,
    )
    # The read above opened a transaction; every payment below gets its own
    await session.rollback()
    for payment_id in ids:
        try:
            payment = await payment_repository.get_by_id(session, payment_id)
            if payment is None or payment.status not in OPEN_STATUSES:
                await session.rollback()
                continue
            if not payment.provider_payment_id:
                if now - payment.created_at >= NO_ANSWER_AFTER:
                    locked = await payment_repository.get_by_id(session, payment_id, for_update=True)
                    if locked is not None and locked.status == PAYMENT_NEW:
                        locked.status, locked.failure_reason = PAYMENT_FAILED, "no_provider_answer"
                        done["written_off"] += 1
                await session.commit()
                continue
            provider = await yookassa_client.get_payment(payment.provider_payment_id)
            settlement = await settle(session, provider, now)
            await session.commit()
            if settlement is not None and settlement.outcome != OUTCOME_UNCHANGED:
                done[settlement.outcome] += 1
                await announce(settlement)
        except yookassa_client.ProviderUnavailable:
            await session.rollback()
            logger.warning("YooKassa is unavailable, the rest of the payments wait for the next tick")
            break
        except Exception:
            await session.rollback()
            logger.exception("Could not settle payment %s", payment_id)
    return done
