"""Group chats connected to organizations: stored messages and request detection in dialogs."""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_workflow as W
from app.core.config import settings
from app.models.organization import Organization
from app.models.telegram import TelegramChat, TelegramMessage, TelegramRequestSuggestion
from app.models.user import User
from app.repositories import organization_repository, telegram_repository
from app.services import telegram_suggestion_service
from app.services.openrouter_client import post_chat_completion, strip_json_fence
from app.services.request_analysis_parser import extract_first_json_object
from app.services.telegram_suggestion_service import SuggestionError

logger = logging.getLogger(__name__)

# How much of the dialog a single analysis looks at
ANALYSIS_NEW_MESSAGES_LIMIT = 60
ANALYSIS_CONTEXT_MESSAGES = 10
EXPLICIT_CONTEXT_MESSAGES = 20
MAX_SUGGESTIONS_PER_WINDOW = 3
MIN_CONFIDENCE = 0.6
_MAX_MESSAGE_CHARS = 1000


class GroupError(Exception):
    """User-facing reason (Russian) why a group command can't be done."""


@dataclass
class DetectedRequest:
    title: str
    message_ids: list[int]
    same_as: uuid.UUID | None
    confidence: float


# ─── Connection ──────────────────────────────────────────────────────────────


async def owned_organizations(session: AsyncSession, user: User) -> list[Organization]:
    organizations = await organization_repository.get_orgs_for_user(session, user.id)
    memberships = await organization_repository.get_members_for_user(
        session, user.id, [organization.id for organization in organizations]
    )
    managed = {m.organization_id for m in memberships if m.role_tag in W.MANAGER_ROLE_TAGS}
    return [organization for organization in organizations if organization.id in managed]


async def _require_member(session: AsyncSession, organization_id: uuid.UUID, user: User, *, manager: bool) -> None:
    member = await organization_repository.get_member(session, organization_id, user.id)
    if member is None:
        raise GroupError("Вы не участник организации, к которой подключена группа")
    if manager and member.role_tag not in W.MANAGER_ROLE_TAGS:
        raise GroupError("Это может сделать только владелец организации")


async def connect_chat(
    session: AsyncSession, *, chat_id: int, title: str | None, organization_id: uuid.UUID, user: User
) -> TelegramChat:
    await _require_member(session, organization_id, user, manager=True)
    chat = await telegram_repository.get_chat(session, chat_id)
    if chat is None:
        chat = await telegram_repository.add_chat(
            session,
            TelegramChat(chat_id=chat_id, organization_id=organization_id),
        )
    elif chat.organization_id != organization_id:
        if chat.is_active:
            # Taking over a connected group is up to the owner of its current organization
            await _require_member(session, chat.organization_id, user, manager=True)
        # Reconnecting to another organization: its old dialog must not leak into the new one
        await telegram_repository.delete_messages(session, chat_id=chat_id)
        chat.last_analyzed_message_id = None
    chat.organization_id = organization_id
    chat.title = title
    chat.connected_by_user_id = user.id
    chat.is_active = True
    chat.paused = False
    await session.commit()
    return chat


async def disconnect_chat(session: AsyncSession, chat: TelegramChat, user: User) -> None:
    await _require_member(session, chat.organization_id, user, manager=True)
    await deactivate_chat(session, chat)


async def deactivate_chat(session: AsyncSession, chat: TelegramChat) -> None:
    chat.is_active = False
    await telegram_repository.delete_messages(session, chat_id=chat.chat_id)
    await session.commit()


async def set_paused(session: AsyncSession, chat: TelegramChat, user: User, *, paused: bool) -> None:
    await _require_member(session, chat.organization_id, user, manager=False)
    chat.paused = paused
    await session.commit()


async def migrate_chat(session: AsyncSession, *, old_chat_id: int, new_chat_id: int) -> None:
    """A group became a supergroup — Telegram changes its id."""
    chat = await telegram_repository.get_chat(session, old_chat_id)
    if chat is None:
        return
    chat.chat_id = new_chat_id
    await telegram_repository.move_chat_messages(session, old_chat_id=old_chat_id, new_chat_id=new_chat_id)
    await session.commit()


# ─── Messages ────────────────────────────────────────────────────────────────


async def store_message(
    session: AsyncSession,
    chat: TelegramChat,
    *,
    message_id: int,
    from_telegram_user_id: int | None,
    from_name: str | None,
    text: str | None,
    reply_to_message_id: int | None,
    attachments: list[dict[str, Any]] | None,
    sent_at: datetime,
) -> None:
    await telegram_repository.insert_message(
        session,
        {
            "chat_id": chat.chat_id,
            "message_id": message_id,
            "from_telegram_user_id": from_telegram_user_id,
            "from_name": from_name,
            "text": text,
            "reply_to_message_id": reply_to_message_id,
            "attachments": attachments or None,
            "sent_at": sent_at,
        },
    )
    chat.last_message_at = max(chat.last_message_at or sent_at, sent_at)
    await session.commit()


def _message_line(message: TelegramMessage) -> str:
    text = (message.text or "").strip()
    if len(text) > _MAX_MESSAGE_CHARS:
        text = text[: _MAX_MESSAGE_CHARS - 1] + "…"
    files = ", ".join(str(item.get("name")) for item in message.attachments or [])
    if files:
        text = f"{text} [вложения: {files}]".strip()
    return f"[{message.message_id}] {message.from_name or 'Участник'} ({message.sent_at:%d.%m %H:%M}): {text}"


def render_dialog(messages: list[TelegramMessage]) -> str:
    return "\n".join(
        f"{m.from_name or 'Участник'} ({m.sent_at:%d.%m %H:%M}): {(m.text or '').strip()}".rstrip()
        for m in messages
    )


def _transcript(messages: list[TelegramMessage]) -> list[dict[str, Any]]:
    return [
        {
            "message_id": m.message_id,
            "from_name": m.from_name,
            "text": m.text or "",
            "sent_at": m.sent_at.isoformat(),
        }
        for m in messages
    ]


def _attachments(messages: list[TelegramMessage]) -> list[dict[str, Any]]:
    return [item for m in messages for item in (m.attachments or [])]


async def context_messages(
    session: AsyncSession, chat: TelegramChat, *, up_to_message_id: int | None = None
) -> list[TelegramMessage]:
    return await telegram_repository.list_messages_up_to(
        session, chat.chat_id, up_to_message_id=up_to_message_id, limit=EXPLICIT_CONTEXT_MESSAGES
    )


async def create_group_suggestion(
    session: AsyncSession,
    chat: TelegramChat,
    messages: list[TelegramMessage],
    *,
    extra_text: str | None = None,
    initiator_user_id: uuid.UUID | None = None,
) -> TelegramRequestSuggestion:
    source_text = render_dialog(messages)
    if extra_text:
        source_text = f"{source_text}\n\nУточнение: {extra_text}".strip()
    suggestion = await telegram_suggestion_service.create_suggestion(
        session,
        organization_id=chat.organization_id,
        source_kind=telegram_suggestion_service.SOURCE_GROUP,
        source_text=source_text,
        initiator_user_id=initiator_user_id,
        telegram_chat_id=chat.chat_id,
        chat_title=chat.title,
        transcript=_transcript(messages),
        attachments=_attachments(messages),
    )
    if messages:
        last_id = messages[-1].message_id
        # Explicitly handled messages should not be offered again by the passive analysis
        if chat.last_analyzed_message_id is None or chat.last_analyzed_message_id < last_id:
            chat.last_analyzed_message_id = last_id
            await session.commit()
    return suggestion


# ─── Passive detection ───────────────────────────────────────────────────────

_DETECT_SYSTEM_PROMPT = (
    "Ты анализируешь переписку рабочего чата команды и находишь в ней заявки — конкретные задачи "
    "или поручения, которые кто-то просит выполнить: сделать, подготовить, напечатать, закупить, "
    "исправить, организовать. Обычное обсуждение, вопросы и ответы, приветствия, шутки, отчёты "
    "о сделанном — не заявки. Отвечай только JSON без markdown и пояснений."
)


def _detect_messages(
    context: list[TelegramMessage],
    new_messages: list[TelegramMessage],
    open_suggestions: list[TelegramRequestSuggestion],
) -> list[dict[str, str]]:
    known = [{"id": str(s.id), "title": s.title} for s in open_suggestions]
    earlier = "\n".join(_message_line(m) for m in context) or "(нет)"
    fresh = "\n".join(_message_line(m) for m in new_messages)
    user_prompt = (
        "Уже предложенные заявки этого чата (не дублируй их; если новые сообщения продолжают одну из них, "
        f"верни её id в same_as):\n{json.dumps(known, ensure_ascii=False)}\n\n"
        f"Ранее в чате (только для контекста):\n{earlier}\n\n"
        f"НОВЫЕ сообщения (формат: [id] автор (время): текст):\n{fresh}\n\n"
        'Верни JSON вида {"requests": [{"title": "суть заявки", "message_ids": [id сообщений с заявкой '
        'и её деталями], "same_as": null, "confidence": 0.0}]}. Только заявки из НОВЫХ сообщений, '
        f"не больше {MAX_SUGGESTIONS_PER_WINDOW}; пустой список, если заявок нет. "
        "confidence — уверенность от 0 до 1, что это действительно заявка."
    )
    return [
        {"role": "system", "content": _DETECT_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]


def parse_detection(
    raw: str, *, known_message_ids: set[int], open_suggestion_ids: set[uuid.UUID]
) -> list[DetectedRequest]:
    chunk = extract_first_json_object(strip_json_fence(raw.strip()))
    try:
        payload = json.loads(chunk) if chunk else None
    except (json.JSONDecodeError, ValueError):
        payload = None
    items = payload.get("requests") if isinstance(payload, dict) else None
    detected: list[DetectedRequest] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        try:
            confidence = float(item.get("confidence", 0))
        except (TypeError, ValueError):
            confidence = 0.0
        if confidence < MIN_CONFIDENCE:
            continue
        ids: list[int] = []
        for value in item.get("message_ids") or []:
            try:
                message_id = int(value)
            except (TypeError, ValueError):
                continue
            if message_id in known_message_ids:
                ids.append(message_id)
        same_as = None
        try:
            candidate = uuid.UUID(str(item.get("same_as")))
            same_as = candidate if candidate in open_suggestion_ids else None
        except ValueError:
            pass
        detected.append(
            DetectedRequest(
                title=str(item.get("title") or "").strip(),
                message_ids=sorted(set(ids)),
                same_as=same_as,
                confidence=confidence,
            )
        )
    return detected[:MAX_SUGGESTIONS_PER_WINDOW]


async def _extend_suggestion(
    session: AsyncSession, suggestion: TelegramRequestSuggestion, messages: list[TelegramMessage]
) -> TelegramRequestSuggestion:
    """The dialog continued an open suggestion: merge the new messages and fill the form again."""
    known = {item.get("message_id") for item in suggestion.transcript or []}
    added = [m for m in messages if m.message_id not in known]
    if not added:
        return suggestion
    suggestion.transcript = [*(suggestion.transcript or []), *_transcript(added)]
    suggestion.attachments = [*(suggestion.attachments or []), *_attachments(added)] or None
    suggestion.source_text = f"{suggestion.source_text}\n{render_dialog(added)}".strip()
    if suggestion.form_id is not None:
        try:
            return await telegram_suggestion_service.change_form(session, suggestion, suggestion.form_id)
        except SuggestionError:
            logger.warning("Could not refill suggestion %s", suggestion.id)
    await session.commit()
    return suggestion


async def analyze_chat(
    session: AsyncSession, chat: TelegramChat
) -> list[tuple[TelegramRequestSuggestion, bool]]:
    """Look at unanalyzed messages; returns (suggestion, is_new) pairs to show in the chat."""
    new_messages = await telegram_repository.list_messages_after(
        session, chat.chat_id, after_message_id=chat.last_analyzed_message_id, limit=ANALYSIS_NEW_MESSAGES_LIMIT
    )
    if not new_messages:
        return []
    context = await telegram_repository.list_messages_up_to(
        session,
        chat.chat_id,
        up_to_message_id=new_messages[0].message_id - 1,
        limit=ANALYSIS_CONTEXT_MESSAGES,
    )
    open_suggestions = await telegram_repository.list_pending_suggestions_for_chat(
        session,
        chat.chat_id,
        created_after=datetime.now(timezone.utc) - timedelta(hours=settings.TELEGRAM_SUGGESTION_TTL_HOURS),
    )
    # The cursor moves even if the LLM fails: detection is best effort, /request is the fallback
    chat.last_analyzed_message_id = new_messages[-1].message_id
    await session.commit()

    try:
        raw = await post_chat_completion(
            _detect_messages(context, new_messages, open_suggestions), max_tokens=800, temperature=0.1
        )
    except Exception:
        logger.exception("Request detection failed for chat %s", chat.chat_id)
        return []
    all_messages = {m.message_id: m for m in [*context, *new_messages]}
    detected = parse_detection(
        raw,
        known_message_ids=set(all_messages),
        open_suggestion_ids={s.id for s in open_suggestions},
    )

    open_by_id = {s.id: s for s in open_suggestions}
    results: list[tuple[TelegramRequestSuggestion, bool]] = []
    for item in detected:
        messages = [all_messages[i] for i in item.message_ids] or new_messages
        try:
            if item.same_as is not None:
                results.append((await _extend_suggestion(session, open_by_id[item.same_as], messages), False))
            else:
                results.append((await create_group_suggestion(session, chat, messages), True))
        except SuggestionError as exc:
            logger.warning("Suggestion for chat %s skipped: %s", chat.chat_id, exc)
    return results


# ─── Housekeeping ────────────────────────────────────────────────────────────


async def expire_suggestions(session: AsyncSession) -> list[TelegramRequestSuggestion]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.TELEGRAM_SUGGESTION_TTL_HOURS)
    stale = await telegram_repository.list_stale_pending_suggestions(session, created_before=cutoff)
    for suggestion in stale:
        suggestion.status = telegram_suggestion_service.STATUS_EXPIRED
    await session.commit()
    return stale


async def purge_old_messages(session: AsyncSession) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.TELEGRAM_MESSAGE_RETENTION_DAYS)
    removed = await telegram_repository.delete_messages(session, sent_before=cutoff)
    await session.commit()
    return removed
