from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.forms import router as forms_router
from app.api.routes.requests import router as requests_router
from app.api.routes.files import router as files_router
from app.api.routes.organizations import router as organizations_router
from app.api.routes.public import router as public_router
from app.api.routes.suggest import router as suggest_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.join import router as join_router
from app.api.routes.telegram import router as telegram_router
from app.api.routes.surveys import (
    methodologies_router,
    projects_router as survey_projects_router,
    public_router as public_surveys_router,
    router as surveys_router,
)

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(forms_router, prefix="/forms", tags=["forms"])
api_router.include_router(requests_router, prefix="/requests", tags=["requests"])
api_router.include_router(files_router, tags=["files"])
api_router.include_router(organizations_router, prefix="/organizations", tags=["organizations"])
api_router.include_router(public_router, prefix="/public/request", tags=["public"])
api_router.include_router(suggest_router, prefix="/suggest", tags=["suggest"])
api_router.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
api_router.include_router(join_router, prefix="/join", tags=["join"])
api_router.include_router(telegram_router, prefix="/telegram", tags=["telegram"])
api_router.include_router(surveys_router, prefix="/surveys", tags=["surveys"])
api_router.include_router(
    survey_projects_router, prefix="/survey-projects", tags=["surveys"]
)
api_router.include_router(
    methodologies_router, prefix="/methodologies", tags=["surveys"]
)
api_router.include_router(
    public_surveys_router, prefix="/public/surveys", tags=["public"]
)
