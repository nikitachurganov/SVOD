import uuid

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.form import CreateFormRequest, FormResponse, UpdateFormRequest
from app.services import form_service

router = APIRouter()


@router.get("", response_model=list[FormResponse])
async def list_forms(
    session: DbSession,
    _user: CurrentUser,
    organization_id: uuid.UUID | None = Query(default=None),
) -> list[FormResponse]:
    return await form_service.list_forms(session, organization_id=organization_id)


@router.get("/{form_id}", response_model=FormResponse)
async def get_form(form_id: str, session: DbSession, _user: CurrentUser) -> FormResponse:
    return await form_service.get_form(session, form_id)


@router.post("", response_model=FormResponse, status_code=201)
async def create_form(
    payload: CreateFormRequest, session: DbSession, user: CurrentUser
) -> FormResponse:
    return await form_service.create_form(session, payload, user)


@router.put("/{form_id}", response_model=FormResponse)
async def update_form(
    form_id: str, payload: UpdateFormRequest, session: DbSession, _user: CurrentUser
) -> FormResponse:
    return await form_service.update_form(session, form_id, payload)


@router.delete("/{form_id}", status_code=204)
async def delete_form(form_id: str, session: DbSession, _user: CurrentUser) -> None:
    await form_service.delete_form(session, form_id)
