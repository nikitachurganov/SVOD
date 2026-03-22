import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.form import Form
from app.models.user import User
from app.repositories import form_repository
from app.schemas.form import CreateFormRequest, FormResponse, UpdateFormRequest
from app.schemas.user import PublicAuthorResponse


def _to_author(author: User | None) -> PublicAuthorResponse | None:
    if author is None:
        return None
    return PublicAuthorResponse(
        id=str(author.id),
        first_name=author.first_name,
        last_name=author.last_name,
        middle_name=author.middle_name,
        email=author.email,
    )


def _to_response(form: Form) -> FormResponse:
    return FormResponse(
        id=str(form.id),
        name=form.name,
        description=form.description or "",
        pages=form.fields if isinstance(form.fields, list) else [],
        organization_id=str(form.organization_id) if form.organization_id else None,
        created_by_user_id=str(form.created_by_user_id) if form.created_by_user_id else None,
        author=_to_author(form.author),
        created_at=form.created_at.isoformat(),
        updated_at=form.updated_at.isoformat(),
    )


async def list_forms(
    session: AsyncSession, organization_id: uuid.UUID | None = None
) -> list[FormResponse]:
    if organization_id is not None:
        forms = await form_repository.get_all_by_org(session, organization_id)
    else:
        forms = await form_repository.get_all(session)
    return [_to_response(f) for f in forms]


async def get_form(session: AsyncSession, form_id: str) -> FormResponse:
    form = await form_repository.get_by_id(session, uuid.UUID(form_id))
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    return _to_response(form)


async def create_form(
    session: AsyncSession, payload: CreateFormRequest, current_user: User
) -> FormResponse:
    org_id = uuid.UUID(payload.organization_id) if payload.organization_id else None
    form = Form(
        name=payload.name,
        description=payload.description,
        created_by_user_id=current_user.id,
        organization_id=org_id,
        fields=payload.pages,
    )
    form = await form_repository.create(session, form)
    await session.commit()
    return _to_response(form)


async def update_form(
    session: AsyncSession, form_id: str, payload: UpdateFormRequest
) -> FormResponse:
    form = await form_repository.get_by_id(session, uuid.UUID(form_id))
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")

    form.name = payload.name
    form.description = payload.description
    form.fields = payload.pages
    form.updated_at = datetime.now(timezone.utc)

    form = await form_repository.update(session, form)
    await session.commit()
    return _to_response(form)


async def delete_form(session: AsyncSession, form_id: str) -> None:
    deleted = await form_repository.remove(session, uuid.UUID(form_id))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    await session.commit()
