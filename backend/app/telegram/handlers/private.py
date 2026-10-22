"""Private chat: account linking, help, organization choice, /new, /my, /free."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from aiogram import Bot, F, Router, html
from aiogram.enums import ChatAction, ChatMemberStatus, ChatType
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, ChatMemberUpdated, Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import request_execution as C
from app.constants import request_workflow as W
from app.models.organization import Organization
from app.models.telegram import TelegramAccount
from app.models.user import User
from app.repositories import organization_repository, request_repository, telegram_repository
from app.services import telegram_link_service, telegram_suggestion_service
from app.services.telegram_suggestion_service import SuggestionError
from app.telegram import keyboards, texts
from app.telegram.attachments import extract_attachments
from app.telegram.cards import publish_card
from app.telegram.keyboards import OrganizationAction

router = Router(name="private")
router.message.filter(F.chat.type == ChatType.PRIVATE)

MY_REQUESTS_LIMIT = 15
FREE_REQUESTS_LIMIT = 10


class NewRequest(StatesGroup):
    waiting_text = State()


def _display_name(message: Message) -> str | None:
    user = message.from_user
    return user.full_name if user else None


@router.message(CommandStart(deep_link=True))
async def start_with_token(message: Message, command: CommandObject, session: AsyncSession) -> None:
    if message.from_user is None or not command.args:
        return
    user = await telegram_link_service.consume_link_token(
        session,
        command.args.strip(),
        telegram_user_id=message.from_user.id,
        username=message.from_user.username,
        display_name=_display_name(message),
    )
    if user is None:
        await message.answer(texts.LINK_INVALID)
        return
    await message.answer(texts.link_success(user.full_name))


@router.message(CommandStart())
async def start(message: Message, session: AsyncSession) -> None:
    if message.from_user is None:
        return
    linked = await telegram_link_service.get_linked_user(session, message.from_user.id)
    if linked is None:
        await message.answer(texts.not_linked_greeting())
        return
    account, user = linked
    if account.blocked_at is not None:
        # The user unblocked the bot — resume delivery
        account.blocked_at = None
        await session.commit()
    await message.answer(texts.linked_greeting(user.full_name))


@router.my_chat_member(F.chat.type == ChatType.PRIVATE)
async def on_private_membership(event: ChatMemberUpdated, session: AsyncSession) -> None:
    """The user blocked or unblocked the bot: pause or resume notification delivery."""
    account = await telegram_repository.get_account_by_telegram_id(session, event.from_user.id)
    if account is None:
        return
    blocked = event.new_chat_member.status == ChatMemberStatus.KICKED
    account.blocked_at = datetime.now(timezone.utc) if blocked else None
    await session.commit()


@router.message(Command("help"))
async def help_command(message: Message) -> None:
    await message.answer(texts.HELP)


@router.message(Command("cancel"))
async def cancel(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer(texts.CANCELLED)


# ─── Organization context ────────────────────────────────────────────────────


async def _current_organization(
    session: AsyncSession, account: TelegramAccount, user: User
) -> tuple[Organization | None, list[Organization]]:
    """The org for /new and /free: the chosen one, or the only one; None when a choice is needed."""
    organizations = await organization_repository.get_orgs_for_user(session, user.id)
    by_id = {organization.id: organization for organization in organizations}
    if account.current_organization_id in by_id:
        return by_id[account.current_organization_id], organizations
    if len(organizations) == 1:
        return organizations[0], organizations
    return None, organizations


async def _linked(message: Message, session: AsyncSession) -> tuple[TelegramAccount, User] | None:
    if message.from_user is None:
        return None
    linked = await telegram_link_service.get_linked_user(session, message.from_user.id)
    if linked is None:
        await message.answer(texts.NOT_LINKED)
    return linked


@router.message(Command("org"))
async def choose_organization(message: Message, session: AsyncSession) -> None:
    linked = await _linked(message, session)
    if linked is None:
        return
    account, user = linked
    current, organizations = await _current_organization(session, account, user)
    if not organizations:
        await message.answer(texts.NO_ORGANIZATIONS)
        return
    await message.answer(
        texts.CHOOSE_ORGANIZATION,
        reply_markup=keyboards.organizations_keyboard(
            organizations, action="set", current_id=current.id if current else None
        ),
    )


async def _ask_for_description(message: Message, state: FSMContext, organization: Organization) -> None:
    await state.set_state(NewRequest.waiting_text)
    await state.update_data(organization_id=str(organization.id))
    await message.answer(f"{texts.organization_selected(organization.name)}\n\n{texts.ASK_NEW_REQUEST}")


async def _send_free_requests(message: Message, session: AsyncSession, organization: Organization) -> None:
    requests = await request_repository.get_all_filtered(
        session,
        organization_id=organization.id,
        archived=False,
        workflow_statuses=[W.WF_NEW],
        without_responsible=True,
    )
    shown = requests[:FREE_REQUESTS_LIMIT]
    await message.answer(
        texts.request_list(f"Свободные заявки · {organization.name}", shown),
        reply_markup=keyboards.take_list_keyboard(shown),
    )


@router.callback_query(OrganizationAction.filter(F.action.in_({"set", "new", "free"})))
async def on_organization_chosen(
    callback: CallbackQuery, callback_data: OrganizationAction, session: AsyncSession, state: FSMContext
) -> None:
    linked = await telegram_link_service.get_linked_user(session, callback.from_user.id)
    if linked is None:
        await callback.answer(texts.NOT_LINKED, show_alert=True)
        return
    account, user = linked
    organizations = await organization_repository.get_orgs_for_user(session, user.id)
    organization = next((o for o in organizations if o.id == callback_data.organization_id), None)
    if organization is None:
        await callback.answer("Вы не участник этой организации", show_alert=True)
        return
    account.current_organization_id = organization.id
    await session.commit()
    await callback.answer()
    if not isinstance(callback.message, Message):
        return
    await callback.message.edit_text(texts.organization_selected(organization.name))
    if callback_data.action == "new":
        await _ask_for_description(callback.message, state, organization)
    elif callback_data.action == "free":
        await _send_free_requests(callback.message, session, organization)


# ─── Requests ────────────────────────────────────────────────────────────────


@router.message(Command("new"))
async def new_request(message: Message, session: AsyncSession, state: FSMContext) -> None:
    linked = await _linked(message, session)
    if linked is None:
        return
    account, user = linked
    organization, organizations = await _current_organization(session, account, user)
    if not organizations:
        await message.answer(texts.NO_ORGANIZATIONS)
        return
    if organization is None:
        await message.answer(
            texts.CHOOSE_ORGANIZATION,
            reply_markup=keyboards.organizations_keyboard(organizations, action="new"),
        )
        return
    await _ask_for_description(message, state, organization)


@router.message(Command("my"))
async def my_requests(message: Message, session: AsyncSession) -> None:
    linked = await _linked(message, session)
    if linked is None:
        return
    _account, user = linked
    requests = await request_repository.list_involving_user(
        session,
        user.id,
        exclude_workflow_statuses=frozenset({W.WF_CLOSED, W.WF_CANCELLED, W.WF_ARCHIVED}),
        exclude_stage_statuses=C.STAGE_TERMINAL,
        limit=MY_REQUESTS_LIMIT,
    )
    await message.answer(texts.request_list("Мои активные заявки", requests))


@router.message(Command("free"))
async def free_requests(message: Message, session: AsyncSession) -> None:
    linked = await _linked(message, session)
    if linked is None:
        return
    account, user = linked
    organization, organizations = await _current_organization(session, account, user)
    if not organizations:
        await message.answer(texts.NO_ORGANIZATIONS)
        return
    if organization is None:
        await message.answer(
            texts.CHOOSE_ORGANIZATION,
            reply_markup=keyboards.organizations_keyboard(organizations, action="free"),
        )
        return
    await _send_free_requests(message, session, organization)


@router.message(NewRequest.waiting_text)
async def new_request_description(
    message: Message, session: AsyncSession, state: FSMContext, bot: Bot
) -> None:
    text = (message.text or message.caption or "").strip()
    if not text or text.startswith("/"):
        await message.answer(texts.NEW_REQUEST_EMPTY)
        return
    linked = await _linked(message, session)
    if linked is None:
        await state.clear()
        return
    _account, user = linked
    data = await state.get_data()
    await state.clear()

    progress = await message.answer(texts.DRAFT_IN_PROGRESS)
    await bot.send_chat_action(message.chat.id, ChatAction.TYPING)
    try:
        suggestion = await telegram_suggestion_service.create_suggestion(
            session,
            organization_id=uuid.UUID(data["organization_id"]),
            source_kind=telegram_suggestion_service.SOURCE_PRIVATE,
            source_text=text,
            initiator_user_id=user.id,
            attachments=extract_attachments(message),
        )
    except SuggestionError as exc:
        await session.rollback()
        await progress.edit_text(html.quote(str(exc)))
        return
    await publish_card(progress, suggestion, session)
