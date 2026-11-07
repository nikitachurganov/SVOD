"""Which front end the current request came from: the main web app or the standalone surveys service.

Links that the server puts into answers and emails (join link, account activation) must lead to the
front end the person is working in. The surveys front end says so in the X-App-Service header, the
middleware in main.py remembers it for the length of the request.
"""

from __future__ import annotations

from contextvars import ContextVar

from app.core.config import settings

SERVICE_HEADER = "X-App-Service"
SERVICE_SURVEYS = "surveys"
SERVICE_PLATFORM = "platform"

_service: ContextVar[str] = ContextVar("app_service", default=SERVICE_PLATFORM)


def set_service(value: str | None) -> None:
    """Remember the caller; anything but "surveys" is the main web app."""
    _service.set(SERVICE_SURVEYS if (value or "").strip().lower() == SERVICE_SURVEYS else SERVICE_PLATFORM)


def current_service() -> str:
    return _service.get()


def app_base_url(service: str | None = None) -> str:
    """Public address of the front end of the service (the current one by default), no trailing slash.

    The surveys service has its own address when SURVEYS_APP_PUBLIC_URL is set; otherwise both
    front ends share APP_PUBLIC_URL.
    """
    if (service or current_service()) == SERVICE_SURVEYS and settings.SURVEYS_APP_PUBLIC_URL.strip():
        return settings.SURVEYS_APP_PUBLIC_URL.strip().rstrip("/")
    return settings.APP_PUBLIC_URL.strip().rstrip("/")
