from fastapi import FastAPI
from fastapi import Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api.routes import api_router
from app.core.config import settings
from app.core.metrics import REQUEST_API_ERRORS

app = FastAPI(title="Service Desk API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    # Keep local frontend development stable even when env list is missing/misconfigured.
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.middleware("http")
async def collect_request_api_errors(request, call_next):
    try:
        response = await call_next(request)
    except Exception:
        if request.url.path.startswith("/requests/"):
            REQUEST_API_ERRORS.labels(request.method, "500").inc()
        raise
    if request.url.path.startswith("/requests/") and response.status_code >= 400:
        REQUEST_API_ERRORS.labels(request.method, str(response.status_code)).inc()
    return response


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
