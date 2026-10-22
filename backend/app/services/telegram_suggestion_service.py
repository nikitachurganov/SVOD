"""Request drafts from Telegram: prepare, adjust, confirm into a real request, dismiss."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.form_file import FormFile
from app.models.telegram import TelegramRequestSuggestion
from app.models.user import User
from app.repositories import (
    file_repository,
    organization_repository,
    request_repository,
    telegram_repository,
    user_repository,
)
from app.schemas.request import CreateRequestPayload
from app.schemas.telegram import TelegramRequestSourceResponse, TelegramTranscriptMessage
from app.services import request_draft_ai_service, request_service, storage_service
from app.services import request_permissions as perms
from app.services.request_draft_ai_service import ATTACHMENTS_FIELD_ID, RequestDraft
from app.core.config import settings

logger = logging.getLogger(__name__)

STATUS_PENDING = "pending"
STATUS_CREATED = "created"
STATUS_DISMISSED = "dismissed"
STATUS_EXPIRED = "expired"

SOURCE_PRIVATE = "private"
SOURCE_GROUP = "group"


class SuggestionError(Exception):
    """A user-facing reason why the draft cannot be acted upon (Russian text)."""


@dataclass
class DownloadedFile:
    name: str
    mime: str
    content: bytes


def _apply_draft(suggestion: TelegramRequestSuggestion, draft: RequestDraft) -> None:
    suggestion.title = draft.title
    suggestion.summary = draft.summary
    suggestion.priority = draft.priority
    suggestion.form_id = draft.form.id
    suggestion.form_name = draft.form.name
    suggestion.data = draft.data
    suggestion.form_snapshot = draft.form_snapshot
    suggestion.missing_required = draft.missing_required
    if draft.form_choices:
        suggestion.form_choices = draft.form_choices


async def create_suggestion(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    source_kind: str,
    source_text: str,
    initiator_user_id: uuid.UUID | None = None,
    telegram_chat_id: int | None = None,
    chat_title: str | None = None,
    transcript: list[dict[str, Any]] | None = None,
    attachments: list[dict[str, Any]] | None = None,
) -> TelegramRequestSuggestion:
    """Run the AI draft pipeline and persist the result as a pending suggestion."""
    try:
        draft = await request_draft_ai_service.draft_from_text(session, organization_id, source_text)
    except request_draft_ai_service.DraftError as exc:
        raise SuggestionError(str(exc)) from exc
    suggestion = TelegramRequestSuggestion(
        organization_id=organization_id,
        source_kind=source_kind,
        telegram_chat_id=telegram_chat_id,
        chat_title=chat_title,
        initiator_user_id=initiator_user_id,
        source_text=source_text,
        transcript=transcript,
        attachments=attachments or None,
        status=STATUS_PENDING,
    )
    _apply_draft(suggestion, draft)
    await telegram_repository.add_suggestion(session, suggestion)
    await session.commit()
    return suggestion


async def load_for_action(
    session: AsyncSession, suggestion_id: uuid.UUID, user: User
) -> TelegramRequestSuggestion:
    """Lock a pending draft the user may act on: the author of /new, any org member for groups."""
    suggestion = await telegram_repository.get_suggestion_for_update(session, suggestion_id)
    if suggestion is None:
        raise SuggestionError("Черновик не найден")
    if suggestion.status == STATUS_CREATED:
        raise SuggestionError(f"Заявка уже создана: № {suggestion.request_id}")
    if suggestion.status != STATUS_PENDING:
        raise SuggestionError("Черновик уже неактуален")
    member = await organization_repository.get_member(session, suggestion.organization_id, user.id)
    if member is None:
        raise SuggestionError("Вы не участник организации, к которой относится заявка")
    if suggestion.source_kind == SOURCE_PRIVATE and suggestion.initiator_user_id != user.id:
        raise SuggestionError("Это чужой черновик")
    return suggestion


async def change_form(
    session: AsyncSession, suggestion: TelegramRequestSuggestion, form_id: uuid.UUID
) -> TelegramRequestSuggestion:
    try:
        draft = await request_draft_ai_service.redraft_with_form(
            session, suggestion.organization_id, form_id, suggestion.source_text
        )
    except request_draft_ai_service.DraftError as exc:
        raise SuggestionError(str(exc)) from exc
    _apply_draft(suggestion, draft)
    await session.commit()
    return suggestion


async def update_text(
    session: AsyncSession, suggestion: TelegramRequestSuggestion, *, title: str | None = None, summary: str | None = None
) -> TelegramRequestSuggestion:
    """Manual edits from «Изменить»: the summary also replaces its copy in the form data."""
    if title is not None:
        suggestion.title = title.strip()[:500] or suggestion.title
    if summary is not None and summary.strip():
        previous = suggestion.summary
        suggestion.summary = summary.strip()
        data = dict(suggestion.data or {})
        for key, value in data.items():
            if value == previous:
                data[key] = suggestion.summary
        suggestion.data = data
    await session.commit()
    return suggestion


async def dismiss(session: AsyncSession, suggestion: TelegramRequestSuggestion, user: User) -> None:
    suggestion.status = STATUS_DISMISSED
    suggestion.decided_by_user_id = user.id
    suggestion.decided_at = datetime.now(timezone.utc)
    await session.commit()


async def confirm(session: AsyncSession, suggestion: TelegramRequestSuggestion, user: User) -> int:
    """Create the request from the draft on behalf of `user`; returns the request number."""
    if suggestion.form_id is None:
        raise SuggestionError("Форма черновика удалена — выберите другую форму")
    # Mark before create_request commits, so a double click can't produce two requests
    suggestion.status = STATUS_CREATED
    suggestion.decided_by_user_id = user.id
    suggestion.decided_at = datetime.now(timezone.utc)
    response = await request_service.create_request(
        session,
        CreateRequestPayload(
            title=suggestion.title,
            form_id=str(suggestion.form_id),
            organization_id=str(suggestion.organization_id),
            data=suggestion.data or {},
            status="open",
            form_snapshot=suggestion.form_snapshot,
        ),
        user,
        source="telegram",
        priority=suggestion.priority,
    )
    suggestion.request_id = int(response.id)
    await session.commit()
    return suggestion.request_id


def message_url(chat_id: int | None, message_id: int | None) -> str | None:
    """t.me/c links exist only for supergroups (ids like -100…)."""
    if chat_id is None or message_id is None:
        return None
    raw = str(chat_id)
    if not raw.startswith("-100"):
        return None
    return f"https://t.me/c/{raw[4:]}/{message_id}"


async def get_request_source(
    session: AsyncSession, request_id: int, user: User
) -> TelegramRequestSourceResponse:
    await perms.load_request_with_access(session, request_id, user, require_org=False)
    suggestion = await telegram_repository.get_suggestion_by_request(session, request_id)
    if suggestion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request was not created from Telegram")
    transcript = [
        TelegramTranscriptMessage(
            from_name=item.get("from_name"),
            text=str(item.get("text") or ""),
            sent_at=item.get("sent_at"),
        )
        for item in suggestion.transcript or []
        if isinstance(item, dict)
    ]
    first_message_id = next(
        (item.get("message_id") for item in suggestion.transcript or [] if isinstance(item, dict)), None
    )
    confirmed_by = None
    if suggestion.decided_by_user_id is not None:
        decided_by = await user_repository.get_by_id(session, suggestion.decided_by_user_id)
        confirmed_by = decided_by.full_name if decided_by else None
    return TelegramRequestSourceResponse(
        source_kind=suggestion.source_kind,
        chat_title=suggestion.chat_title,
        source_text=suggestion.source_text,
        summary=suggestion.summary,
        transcript=transcript,
        message_url=message_url(suggestion.telegram_chat_id, first_message_id),
        confirmed_by=confirmed_by,
        created_at=suggestion.created_at.isoformat(),
    )


async def attach_files(session: AsyncSession, request_id: int, files: list[DownloadedFile]) -> int:
    """Store files taken from Telegram as a pseudo-field of the request form."""
    request = await request_repository.get_by_id(session, request_id)
    if request is None or not files:
        return 0
    stored: list[dict[str, Any]] = []
    for item in files:
        if not item.content or len(item.content) > settings.MAX_UPLOAD_SIZE_BYTES:
            continue
        object_key = storage_service.build_form_object_key(request_id, ATTACHMENTS_FIELD_ID, item.name)
        try:
            await storage_service.upload_bytes(object_key, item.content, item.mime)
        except Exception:
            logger.exception("Could not store Telegram attachment %s of request %s", item.name, request_id)
            continue
        row = await file_repository.create(
            session,
            FormFile(
                request_id=request_id,
                field_id=ATTACHMENTS_FIELD_ID,
                file_name=item.name,
                file_type=item.mime,
                file_size=len(item.content),
                file_url=f"s3://{settings.S3_BUCKET}/{object_key}",
            ),
        )
        stored.append(
            {
                "id": str(row.id),
                "file_name": row.file_name,
                "file_type": row.file_type,
                "file_size": row.file_size,
                "file_url": f"/files/{row.id}/download-url",
            }
        )
    if not stored:
        return 0

    data = dict(request.data or {})
    data[ATTACHMENTS_FIELD_ID] = [*(data.get(ATTACHMENTS_FIELD_ID) or []), *stored]
    request.data = data
    snapshot = dict(request.form_snapshot or {})
    fields = list(snapshot.get("fields") or [])
    if not any(isinstance(f, dict) and f.get("id") == ATTACHMENTS_FIELD_ID for f in fields):
        fields.append(
            {"id": ATTACHMENTS_FIELD_ID, "label": "Файлы из Telegram", "type": "file_document", "required": False}
        )
        snapshot["fields"] = fields
        request.form_snapshot = snapshot
    await session.commit()
    return len(stored)
