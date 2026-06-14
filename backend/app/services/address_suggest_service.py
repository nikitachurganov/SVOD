"""Address suggestion proxy (DaData and future providers)."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

DADATA_SUGGEST_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address"
YANDEX_GEOSUGGEST_URL = "https://suggest-maps.yandex.ru/v1/suggest"


def _pick_address_component(
    components: list[dict[str, Any]] | None, kinds: set[str]
) -> str | None:
    if not components:
        return None
    for component in components:
        if not isinstance(component, dict):
            continue
        raw_kinds = component.get("kind")
        if not isinstance(raw_kinds, list):
            continue
        if any(str(kind).lower() in kinds for kind in raw_kinds):
            name = component.get("name")
            if isinstance(name, str) and name.strip():
                return name
    return None


def _normalize_yandex_item(item: dict[str, Any]) -> dict[str, Any]:
    title = item.get("title") if isinstance(item.get("title"), dict) else {}
    address = item.get("address") if isinstance(item.get("address"), dict) else {}
    components = address.get("component") if isinstance(address.get("component"), list) else []

    display = ""
    if isinstance(title.get("text"), str):
        display = title["text"]
    elif isinstance(address.get("formatted_address"), str):
        display = address["formatted_address"]

    return {
        "value": display,
        "country": _pick_address_component(components, {"country"}),
        "region": _pick_address_component(components, {"province", "region", "area"}),
        "city": _pick_address_component(components, {"locality", "district"}),
        "street": _pick_address_component(components, {"street"}),
        "house": _pick_address_component(components, {"house"}),
        "provider": "yandex",
        "providerPayload": item,
    }


async def suggest_yandex(
    query: str,
    *,
    limit: int = 5,
    country: str | None = None,
) -> list[dict[str, Any]]:
    trimmed = query.strip()
    if len(trimmed) < 2:
        return []

    api_key = settings.YANDEX_MAPS_API_KEY.strip()
    if not api_key:
        logger.warning("Yandex Maps API key is not configured; geosuggest disabled")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Не задан YANDEX_MAPS_API_KEY на сервере. Добавьте ключ в backend/.env.",
        )

    safe_limit = max(1, min(limit, 10))
    params: dict[str, str] = {
        "apikey": api_key,
        "text": trimmed,
        "lang": "ru",
        "results": str(safe_limit),
        "print_address": "1",
        "types": "house,street,locality,district",
        "countries": (country or "ru").lower(),
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(YANDEX_GEOSUGGEST_URL, params=params)
            if response.status_code == 403:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                        "Ключ Яндекс отклонён для Геосаджеста. "
                        "Подключите API «Геосаджест» к ключу в кабинете разработчика."
                    ),
                )
            response.raise_for_status()
            body = response.json()
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        logger.exception("Yandex geosuggest request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Сервис подсказок Яндекс временно недоступен",
        ) from exc

    results = body.get("results") if isinstance(body, dict) else None
    if not isinstance(results, list):
        return []

    normalized = [
        _normalize_yandex_item(item)
        for item in results
        if isinstance(item, dict)
    ]
    return [item for item in normalized if item.get("value")]


def _normalize_dadata_item(item: dict[str, Any]) -> dict[str, Any]:
    data = item.get("data") if isinstance(item.get("data"), dict) else {}
    return {
        "value": str(item.get("value") or ""),
        "unrestrictedValue": item.get("unrestricted_value"),
        "country": data.get("country"),
        "region": data.get("region_with_type") or data.get("region"),
        "city": data.get("city") or data.get("settlement"),
        "street": data.get("street_with_type") or data.get("street"),
        "house": data.get("house"),
        "flat": data.get("flat"),
        "postalCode": data.get("postal_code"),
        "geoLat": data.get("geo_lat"),
        "geoLon": data.get("geo_lon"),
        "provider": "dadata",
        "providerPayload": item,
    }


async def suggest_address(
    query: str,
    *,
    provider: str = "dadata",
    limit: int = 5,
    country: str | None = None,
    city: str | None = None,
) -> list[dict[str, Any]]:
    trimmed = query.strip()
    safe_limit = max(1, min(limit, 10))

    if provider == "none":
        return []

    if provider == "yandex":
        return await suggest_yandex(trimmed, limit=safe_limit, country=country)

    if len(trimmed) < 3:
        return []

    if provider != "dadata":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider '{provider}' is not supported yet",
        )

    api_key = settings.DADATA_API_KEY.strip()
    if not api_key:
        logger.warning("DaData API key is not configured; address suggestions disabled")
        return []

    payload: dict[str, Any] = {"query": trimmed, "count": safe_limit}
    locations: list[dict[str, str]] = []
    if country:
        locations.append({"country": country})
    if city:
        locations.append({"city": city})
    if locations:
        payload["locations"] = locations

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                DADATA_SUGGEST_URL,
                headers={
                    "Authorization": f"Token {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPError as exc:
        logger.exception("DaData address suggest request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Сервис подсказок адреса временно недоступен",
        ) from exc

    suggestions = body.get("suggestions") if isinstance(body, dict) else None
    if not isinstance(suggestions, list):
        return []

    return [
        _normalize_dadata_item(item)
        for item in suggestions
        if isinstance(item, dict)
    ]
