"""The YooKassa HTTP API: create a payment and read it back.

Only two calls are used. A notification is never trusted for what it says: the payment is read from
the API with the shop's own credentials, and that answer is what settles it. Errors are split in two:
``ProviderUnavailable`` (network, 5xx, 429: try again later) and ``ProviderRejected`` (the request
itself was refused: repeating it will not help).
"""

from __future__ import annotations

import ipaddress
import logging
import uuid
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 20.0

# The names of the YooKassa payment statuses we care about
STATUS_PENDING = "pending"
STATUS_WAITING_FOR_CAPTURE = "waiting_for_capture"
STATUS_SUCCEEDED = "succeeded"
STATUS_CANCELED = "canceled"


class ProviderError(Exception):
    pass


class ProviderUnavailable(ProviderError):
    """The provider could not be reached or is busy: the same call may be repeated later."""


class ProviderRejected(ProviderError):
    """The provider refused the request; ``detail`` is its own explanation."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(f"YooKassa answered {status_code}: {detail}")
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class ProviderPayment:
    """The part of a YooKassa payment that settles ours."""

    id: str
    status: str
    paid: bool
    amount_kopecks: int
    currency: str
    confirmation_url: str | None
    refunded_kopecks: int
    is_test: bool
    cancel_reason: str | None
    metadata: dict[str, Any]


# The addresses YooKassa sends notifications from (its documentation, "HTTP-уведомления")
_PROVIDER_NETWORKS = tuple(
    ipaddress.ip_network(network)
    for network in (
        "185.71.76.0/27",
        "185.71.77.0/27",
        "77.75.153.0/25",
        "77.75.156.11/32",
        "77.75.156.35/32",
        "77.75.154.128/25",
        "2a02:5180::/32",
    )
)


def is_provider_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    return any(ip in network for network in _PROVIDER_NETWORKS if network.version == ip.version)


def format_amount(kopecks: int) -> str:
    """"790.00": YooKassa takes the amount as a string with two decimals."""
    return f"{kopecks // 100}.{kopecks % 100:02d}"


def parse_amount(value: Any) -> int:
    try:
        return int((Decimal(str(value)) * 100).to_integral_value())
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ProviderError(f"Unreadable amount from YooKassa: {value!r}") from exc


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.YOOKASSA_API_URL.rstrip("/"),
        auth=(settings.YOOKASSA_SHOP_ID, settings.YOOKASSA_SECRET_KEY),
        timeout=TIMEOUT_SECONDS,
    )


def _explain(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:200]
    if isinstance(body, dict):
        return str(body.get("description") or body.get("code") or body)[:300]
    return str(body)[:300]


def _read_payment(body: dict[str, Any]) -> ProviderPayment:
    try:
        amount = body["amount"]
        confirmation = body.get("confirmation") or {}
        refunded = body.get("refunded_amount") or {}
        cancellation = body.get("cancellation_details") or {}
        return ProviderPayment(
            id=str(body["id"]),
            status=str(body["status"]),
            paid=bool(body.get("paid", False)),
            amount_kopecks=parse_amount(amount["value"]),
            currency=str(amount["currency"]),
            confirmation_url=confirmation.get("confirmation_url"),
            refunded_kopecks=parse_amount(refunded["value"]) if refunded.get("value") else 0,
            is_test=bool(body.get("test", False)),
            cancel_reason=cancellation.get("reason"),
            metadata=body.get("metadata") or {},
        )
    except (KeyError, TypeError) as exc:
        raise ProviderError(f"Unexpected payment shape from YooKassa: {exc}") from exc


async def _send(method: str, path: str, **kwargs: Any) -> dict[str, Any]:
    try:
        async with _client() as client:
            response = await client.request(method, path, **kwargs)
    except httpx.HTTPError as exc:
        raise ProviderUnavailable(f"YooKassa is not reachable: {exc.__class__.__name__}") from exc
    if response.status_code == 429 or response.status_code >= 500:
        raise ProviderUnavailable(f"YooKassa answered {response.status_code}")
    if response.status_code >= 400:
        raise ProviderRejected(response.status_code, _explain(response))
    try:
        body = response.json()
    except ValueError as exc:
        raise ProviderError("YooKassa answered with something that is not JSON") from exc
    if not isinstance(body, dict):
        raise ProviderError("YooKassa answered with an unexpected body")
    return body


async def create_payment(
    *,
    idempotence_key: str,
    amount_kopecks: int,
    description: str,
    return_url: str,
    metadata: dict[str, str],
) -> ProviderPayment:
    """Create a payment the person confirms by redirect. The same key returns the same payment."""
    body = await _send(
        "POST",
        "/payments",
        headers={"Idempotence-Key": idempotence_key},
        json={
            "amount": {"value": format_amount(amount_kopecks), "currency": "RUB"},
            # Money is taken at once: there is no goods to hold it for
            "capture": True,
            "confirmation": {"type": "redirect", "return_url": return_url},
            "description": description[:128],
            "metadata": metadata,
        },
    )
    return _read_payment(body)


async def get_payment(provider_payment_id: str) -> ProviderPayment:
    """The payment as the provider has it now: the one source a payment is settled from."""
    return _read_payment(await _send("GET", f"/payments/{provider_payment_id}"))


def new_idempotence_key() -> str:
    return uuid.uuid4().hex
