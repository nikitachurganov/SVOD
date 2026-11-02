from fastapi import APIRouter, HTTPException, Request, status

from app.api.deps import DbSession
from app.core.client_ip import client_ip
from app.core.config import settings
from app.schemas.landing_demo import LandingDemoRequest, LandingDemoResponse
from app.services import ai_meter, landing_demo_service
from app.services.public_suggest_rate_limit import check_limit

router = APIRouter()

_HOUR = 3600.0
_DAY = 24 * _HOUR


@router.post("/generate", response_model=LandingDemoResponse)
async def generate_landing_demo(
    payload: LandingDemoRequest, request: Request, session: DbSession
) -> LandingDemoResponse:
    per_ip = settings.LANDING_DEMO_PER_IP_PER_HOUR
    if per_ip > 0 and not check_limit(
        f"landing_demo:{client_ip(request)}", window_sec=_HOUR, max_calls=per_ip
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Превышен лимит демо-генераций. Зарегистрируйтесь, чтобы продолжить в сервисе.",
        )
    # Anonymous calls are not in the usage log, so the whole demo has a daily cap of its own
    per_day = settings.LANDING_DEMO_PER_DAY
    if per_day > 0 and not check_limit("landing_demo:all", window_sec=_DAY, max_calls=per_day):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Демо временно недоступно. Попробуйте позже.",
        )
    await ai_meter.check_service_budget()
    return await landing_demo_service.generate(session, payload.prompt)
