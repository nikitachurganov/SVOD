import time
import uuid
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"

_cached_token: str | None = None
_token_expires_at: float = 0.0


async def get_access_token() -> str:
    global _cached_token, _token_expires_at

    if _cached_token and time.time() < _token_expires_at:
        return _cached_token

    request_id = str(uuid.uuid4())

    async with httpx.AsyncClient(verify=False) as client:
        response = await client.post(
            _OAUTH_URL,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "RqUID": request_id,
                "Authorization": f"Basic {settings.GIGACHAT_AUTH_KEY}",
            },
            data={"scope": settings.GIGACHAT_SCOPE},
            timeout=30.0,
        )
        if response.is_error:
            logger.error("GigaChat OAuth failed: status=%s body=%s", response.status_code, response.text)
            response.raise_for_status()

    payload = response.json()
    _cached_token = payload["access_token"]
    _token_expires_at = payload["expires_at"] / 1000 - 60
    logger.info("GigaChat OAuth token refreshed, expires at %s", _token_expires_at)
    return _cached_token
