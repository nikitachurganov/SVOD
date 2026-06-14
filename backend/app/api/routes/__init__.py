from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.forms import router as forms_router
from app.api.routes.requests import router as requests_router
from app.api.routes.files import router as files_router
from app.api.routes.organizations import router as organizations_router
from app.api.routes.public import router as public_router
from app.api.routes.suggest import router as suggest_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(forms_router, prefix="/forms", tags=["forms"])
api_router.include_router(requests_router, prefix="/requests", tags=["requests"])
api_router.include_router(files_router, tags=["files"])
api_router.include_router(organizations_router, prefix="/organizations", tags=["organizations"])
api_router.include_router(public_router, prefix="/public/request", tags=["public"])
api_router.include_router(suggest_router, prefix="/suggest", tags=["suggest"])
