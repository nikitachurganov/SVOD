"""Group chats: connecting to an organization, storing the dialog, explicit /request."""

from __future__ import annotations

import logging
from datetime import timezone

from aiogram import Bot, F, Router, html
from aiogram.enums import ChatMemberStatus, ChatType
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command, CommandObject
from aiogram.types import CallbackQuery, Chat, ChatMemberUpdated, Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.models.telegram import TelegramChat, TelegramMessage
from app.models.user import User
from app.repositories import telegram_repository
from app.services import telegram_group_service, telegram_link_service
from app.services.telegram_group_service import GroupError
from app.services.telegram_suggestion_service import SuggestionError
from app.telegram import keyboards, texts
from app.telegram.attachments import extract_attachments
from app.telegram.cards import publish_card
from app.telegram.keyboards import OrganizationAction

logger = logging.getLogger("svod.telegram.group")

GROUP_CHAT_TYPES = {ChatType.GROUP, ChatType.SUPERGROUP}

router = Router(name="group")
router.message.filter(F.chat.type.in_(GROUP_CHAT_TYPES))


def _sender_name(message: Message) -> str | None:
    return message.from_user.full_name if message.from_user else None


async def _linked_user(session: AsyncSession, telegram_user_id: int) -> User | None:
    linked = await telegram_link_service.get_linked_user(session, telegram_user_id)
    return linked[1] if linked else None


async def _connected_chat(message: Message, session: AsyncSession) -> TelegramChat | None:
    chat = await telegram_repository.get_chat(session, message.chat.id)
    if chat is None or not chat.is_active:
        await message.reply(texts.GROUP_NOT_CONNECTED)
        return None
    return chat


async def _visibility_warning(bot: Bot, chat_id: int) -> str:
    """Passive analysis needs every message: privacy mode off or admin rights."""
    try:
        me = await bot.me()
        if me.can_read_all_group_messages:
            return ""
        member = await bot.get_chat_member(chat_id, me.id)
    except TelegramAPIError:
        return ""
    if member.status in (ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.CREATOR):
        return ""
    return texts.GROUP_PRIVACY_WARNING


async def _connect(
    message: Message, bot: Bot, session: AsyncSession, chat: Chat, organization: Organization, user: User
) -> None:
    try:
        await telegram_group_service.connect_chat(
            session, chat_id=chat.id, title=chat.title, organization_id=organization.id, user=user
        )
    except GroupError as exc:
        await session.rollback()
        await message.answer(html.quote(str(exc)))
        return
    await message.answer(texts.group_connected(organization.name) + await _visibility_warning(bot, chat.id))


@router.message(Command("connect"))
async def connect(message: Message, session: AsyncSession, bot: Bot) -> None:
    if message.from_user is None:
        return
    user = await _linked_user(session, message.from_user.id)
    if user is None:
        await message.reply(texts.GROUP_NOT_LINKED)
        return
    organizations = await telegram_group_service.owned_organizations(session, user)
    if not organizations:
        await message.reply(texts.GROUP_ONLY_OWNER)
        return
    if len(organizations) == 1:
        await _connect(message, bot, session, message.chat, organizations[0], user)
        return
    await message.reply(
        texts.CHOOSE_ORGANIZATION,
        reply_markup=keyboards.organizations_keyboard(organizations, action="connect"),
    )


@router.callback_query(OrganizationAction.filter(F.action == "connect"))
async def on_connect_choice(
    callback: CallbackQuery, callback_data: OrganizationAction, session: AsyncSession, bot: Bot
) -> None:
    if not isinstance(callback.message, Message):
        await callback.answer()
        return
    user = await _linked_user(session, callback.from_user.id)
    if user is None:
        await callback.answer(texts.GROUP_NOT_LINKED, show_alert=True)
        return
    organizations = await telegram_group_service.owned_organizations(session, user)
    organization = next((o for o in organizations if o.id == callback_data.organization_id), None)
    if organization is None:
        await callback.answer(texts.GROUP_ONLY_OWNER, show_alert=True)
        return
    await callback.answer()
    await callback.message.delete_reply_markup()
    await _connect(callback.message, bot, session, callback.message.chat, organization, user)


@router.message(Command("disconnect"))
async def disconnect(message: Message, session: AsyncSession) -> None:
    if message.from_user is None:
        return
    chat = await _connected_chat(message, session)
    if chat is None:
        return
    user = await _linked_user(session, message.from_user.id)
    if user is None:
        await message.reply(texts.GROUP_NOT_LINKED)
        return
    try:
        await telegram_group_service.disconnect_chat(session, chat, user)
    except GroupError as exc:
        await session.rollback()
        await message.reply(html.quote(str(exc)))
        return
    await message.answer(texts.GROUP_DISCONNECTED)


async def _set_paused(message: Message, session: AsyncSession, *, paused: bool) -> None:
    if message.from_user is None:
        return
    chat = await _connected_chat(message, session)
    if chat is None:
        return
    user = await _linked_user(session, message.from_user.id)
    if user is None:
        await message.reply(texts.GROUP_NOT_LINKED)
        return
    try:
        await telegram_group_service.set_paused(session, chat, user, paused=paused)
    except GroupError as exc:
        await session.rollback()
        await message.reply(html.quote(str(exc)))
        return
    await message.answer(texts.GROUP_PAUSED if paused else texts.GROUP_RESUMED)


@router.message(Command("pause"))
async def pause(message: Message, session: AsyncSession) -> None:
    await _set_paused(message, session, paused=True)


@router.message(Command("resume"))
async def resume(message: Message, session: AsyncSession) -> None:
    await _set_paused(message, session, paused=False)


@router.message(Command("help"))
async def group_help(message: Message) -> None:
    await message.answer(texts.GROUP_HELP)


def _transient_message(message: Message) -> TelegramMessage:
    """A message the bot has not stored (sent before connecting or hidden by privacy mode)."""
    return TelegramMessage(
        chat_id=message.chat.id,
        message_id=message.message_id,
        from_telegram_user_id=message.from_user.id if message.from_user else None,
        from_name=_sender_name(message),
        text=message.text or message.caption,
        attachments=extract_attachments(message) or None,
        sent_at=message.date.astimezone(timezone.utc),
    )


async def _explicit_request(
    message: Message,
    session: AsyncSession,
    chat: TelegramChat,
    *,
    extra_text: str | None,
    anchor: Message | None,
) -> None:
    """/request or a mention: draft a request from the dialog right away, no detection step."""
    messages = await telegram_group_service.context_messages(
        session, chat, up_to_message_id=anchor.message_id if anchor else None
    )
    if anchor is not None and all(m.message_id != anchor.message_id for m in messages):
        messages.append(_transient_message(anchor))
    if anchor is not None:
        # With a reply the anchor and what precedes it matter, later chatter does not
        messages = [m for m in messages if m.message_id <= anchor.message_id]
    if not messages and not extra_text:
        await message.reply(texts.GROUP_NOTHING_TO_ANALYZE)
        return
    initiator = await _linked_user(session, message.from_user.id) if message.from_user else None
    progress = await message.reply(texts.DRAFT_IN_PROGRESS)
    try:
        suggestion = await telegram_group_service.create_group_suggestion(
            session,
            chat,
            messages,
            extra_text=extra_text,
            initiator_user_id=initiator.id if initiator else None,
        )
    except SuggestionError as exc:
        await session.rollback()
        await progress.edit_text(html.quote(str(exc)))
        return
    await publish_card(progress, suggestion, session)


@router.message(Command("request"))
async def request_command(message: Message, command: CommandObject, session: AsyncSession) -> None:
    chat = await _connected_chat(message, session)
    if chat is None:
        return
    await _explicit_request(
        message,
        session,
        chat,
        extra_text=(command.args or "").strip() or None,
        anchor=message.reply_to_message,
    )


@router.message(F.migrate_to_chat_id)
async def on_migrated(message: Message, session: AsyncSession) -> None:
    await telegram_group_service.migrate_chat(
        session, old_chat_id=message.chat.id, new_chat_id=message.migrate_to_chat_id
    )


@router.message()
async def on_group_message(message: Message, session: AsyncSession, bot: Bot) -> None:
    if message.from_user is None or message.from_user.is_bot:
        return
    chat = await telegram_repository.get_chat(session, message.chat.id)
    if chat is None or not chat.is_active:
        return
    text = message.text or message.caption
    attachments = extract_attachments(message)
    if not text and not attachments:
        return
    await telegram_group_service.store_message(
        session,
        chat,
        message_id=message.message_id,
        from_telegram_user_id=message.from_user.id,
        from_name=_sender_name(message),
        text=text,
        reply_to_message_id=message.reply_to_message.message_id if message.reply_to_message else None,
        attachments=attachments,
        sent_at=message.date.astimezone(timezone.utc),
    )
    me = await bot.me()
    if text and me.username and f"@{me.username.lower()}" in text.lower():
        await _explicit_request(message, session, chat, extra_text=None, anchor=message)


@router.my_chat_member(F.chat.type.in_(GROUP_CHAT_TYPES))
async def on_bot_membership(event: ChatMemberUpdated, session: AsyncSession, bot: Bot) -> None:
    status = event.new_chat_member.status
    if status in (ChatMemberStatus.LEFT, ChatMemberStatus.KICKED):
        chat = await telegram_repository.get_chat(session, event.chat.id)
        if chat is not None and chat.is_active:
            await telegram_group_service.deactivate_chat(session, chat)
        return
    was_outside = event.old_chat_member.status in (ChatMemberStatus.LEFT, ChatMemberStatus.KICKED)
    if was_outside:
        try:
            await bot.send_message(event.chat.id, texts.GROUP_ADDED_HINT)
        except TelegramAPIError:
            logger.warning("Could not greet chat %s", event.chat.id)
