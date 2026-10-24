import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.form import Form
from app.models.user import User
from app.repositories import form_repository
from app.schemas.form import CreateFormRequest, FormResponse, UpdateFormRequest
from app.schemas.user import PublicAuthorResponse
from app.services import access_control


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
        usage_count=int(getattr(form, "usage_count", 0) or 0),
        is_universal=bool(getattr(form, "is_universal", False)),
        archived=bool(getattr(form, "archived", False)),
    )


async def _ensure_form_access(session: AsyncSession, form: Form, user: User) -> None:
    if form.organization_id is not None:
        await access_control.ensure_organization_member(session, form.organization_id, user)
        return
    if form.created_by_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def list_forms(
    session: AsyncSession,
    current_user: User,
    organization_id: uuid.UUID | None = None,
    archived: bool | None = None,
    mine: bool = False,
    unused: bool | None = None,
) -> list[FormResponse]:
    organization_ids: list[uuid.UUID] | None = None
    if organization_id is not None:
        await access_control.ensure_organization_member(session, organization_id, current_user)
    elif not mine:
        organization_ids = await access_control.list_accessible_organization_ids(
            session, current_user
        )

    forms = await form_repository.get_all_filtered(
        session,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=archived,
        created_by_user_id=current_user.id if mine else None,
        unused=unused,
    )
    return [_to_response(f) for f in forms]


async def get_counts(
    session: AsyncSession,
    organization_id: uuid.UUID | None,
    current_user: User,
) -> dict[str, int]:
    organization_ids: list[uuid.UUID] | None = None
    if organization_id is not None:
        await access_control.ensure_organization_member(
            session,
            organization_id,
            current_user,
        )
    else:
        organization_ids = await access_control.list_accessible_organization_ids(
            session, current_user
        )

    all_count = await form_repository.count_filtered(
        session,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=False,
    )
    mine_count = await form_repository.count_filtered(
        session,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=False,
        created_by_user_id=current_user.id,
    )
    unused_count = await form_repository.count_filtered(
        session,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=False,
        unused=True,
    )
    archived_count = await form_repository.count_filtered(
        session,
        organization_id=organization_id,
        organization_ids=organization_ids,
        archived=True,
    )
    return {
        "all": all_count,
        "mine": mine_count,
        "unused": unused_count,
        "archived": archived_count,
    }


async def get_form(session: AsyncSession, form_id: str, current_user: User) -> FormResponse:
    form = await form_repository.get_by_id(session, uuid.UUID(form_id))
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    await _ensure_form_access(session, form, current_user)
    return _to_response(form)


async def create_form(
    session: AsyncSession, payload: CreateFormRequest, current_user: User
) -> FormResponse:
    org_id = uuid.UUID(payload.organization_id) if payload.organization_id else None
    if org_id is not None:
        await access_control.ensure_organization_member(session, org_id, current_user)

    form = Form(
        name=payload.name,
        description=payload.description,
        created_by_user_id=current_user.id,
        organization_id=org_id,
        fields=payload.pages,
        is_universal=payload.is_universal,
        archived=False,
    )
    form = await form_repository.create(session, form)
    await session.commit()
    return _to_response(form)


async def update_form(
    session: AsyncSession, form_id: str, payload: UpdateFormRequest, current_user: User
) -> FormResponse:
    form = await form_repository.get_by_id(session, uuid.UUID(form_id))
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    await _ensure_form_access(session, form, current_user)

    form.name = payload.name
    form.description = payload.description
    form.fields = payload.pages
    form.is_universal = payload.is_universal
    form.updated_at = datetime.now(timezone.utc)

    form = await form_repository.update(session, form)
    await session.commit()
    return _to_response(form)


async def delete_form(session: AsyncSession, form_id: str, current_user: User) -> None:
    form_uuid = uuid.UUID(form_id)
    form = await form_repository.get_by_id(session, form_uuid)
    if not form:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    await _ensure_form_access(session, form, current_user)

    deleted = await form_repository.remove(session, form_uuid)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found")
    await session.commit()
