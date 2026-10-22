from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import BotCommand, BotCommandScopeAllGroupChats, BotCommandScopeAllPrivateChats

from app.core.config import settings
from app.telegram import loops
from app.telegram.handlers import group, private, requests, suggestions
from app.telegram.middlewares import DbSessionMiddleware

logger = logging.getLogger("svod.telegram")

PRIVATE_COMMANDS = [
    BotCommand(command="new", description="Создать заявку"),
    BotCommand(command="my", description="Мои активные заявки"),
    BotCommand(command="free", description="Свободные заявки"),
    BotCommand(command="org", description="Выбрать организацию"),
    BotCommand(command="start", description="Статус подключения"),
    BotCommand(command="help", description="Что умеет бот"),
    BotCommand(command="cancel", description="Отменить текущее действие"),
]


GROUP_COMMANDS = [
    BotCommand(command="request", description="Оформить заявку из переписки"),
    BotCommand(command="pause", description="Выключить поиск заявок"),
    BotCommand(command="resume", description="Включить поиск заявок"),
    BotCommand(command="connect", description="Подключить группу к СВОД"),
    BotCommand(command="disconnect", description="Отключить группу"),
    BotCommand(command="help", description="Что умеет бот"),
]


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    dp.update.middleware(DbSessionMiddleware())
    # Order matters: private commands (/cancel …) win over FSM message handlers;
    # the group router ends with a catch-all that stores the dialog
    dp.include_routers(private.router, requests.router, suggestions.router, group.router)
    return dp


async def run() -> None:
    if not settings.telegram_enabled:
        # Idle instead of exiting: compose would restart an exited container in a loop
        logger.warning("TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME are not set — the bot is disabled")
        await asyncio.Event().wait()
    bot = Bot(
        settings.TELEGRAM_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML, link_preview_is_disabled=True),
    )
    dp = build_dispatcher()
    await bot.set_my_commands(PRIVATE_COMMANDS, scope=BotCommandScopeAllPrivateChats())
    await bot.set_my_commands(GROUP_COMMANDS, scope=BotCommandScopeAllGroupChats())
    background = [
        asyncio.create_task(loops.run_notification_outbox(bot), name="telegram-outbox"),
        asyncio.create_task(loops.run_group_loops(bot), name="telegram-groups"),
    ]
    logger.info("Telegram bot @%s started", settings.TELEGRAM_BOT_USERNAME)
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        for task in background:
            task.cancel()
        await bot.session.close()
