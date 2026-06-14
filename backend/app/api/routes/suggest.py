from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.api.deps import CurrentUser
from app.services import address_suggest_service
from app.services.public_suggest_rate_limit import check_public_suggest_limit

router = APIRouter()


@router.get("/address")
async def suggest_address(
    _user: CurrentUser,
    query: str = Query(..., min_length=1, max_length=300),
    provider: str = Query(default="dadata"),
    limit: int = Query(default=5, ge=1, le=10),
    country: str | None = Query(default=None, max_length=120),
    city: str | None = Query(default=None, max_length=120),
) -> list[dict[str, Any]]:
    return await address_suggest_service.suggest_address(
        query,
        provider=provider,
        limit=limit,
        country=country,
        city=city,
    )


@router.get("/yandex")
async def suggest_yandex_address(
    request: Request,
    query: str = Query(..., min_length=2, max_length=300),
    limit: int = Query(default=5, ge=1, le=10),
    country: str | None = Query(default=None, max_length=8),
) -> list[dict[str, Any]]:
    """Public Yandex Geosuggest proxy (rate-limited). Works without JWT for public forms."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_public_suggest_limit(f"yandex-address:{client_ip}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов подсказок. Попробуйте позже.",
        )

    return await address_suggest_service.suggest_yandex(
        query,
        limit=limit,
        country=country,
    )
