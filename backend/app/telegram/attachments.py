"""Photos and documents: remember Telegram file ids, download them when a request is created."""

from __future__ import annotations

import logging
from typing import Any

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError
from aiogram.types import Message

from app.services.telegram_suggestion_service import DownloadedFile

logger = logging.getLogger("svod.telegram.attachments")

# Bot API getFile limit
TELEGRAM_DOWNLOAD_LIMIT_BYTES = 20 * 1024 * 1024


def extract_attachments(message: Message) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if message.photo:
        largest = message.photo[-1]
        items.append(
            {
                "file_id": largest.file_id,
                "kind": "photo",
                "name": f"photo_{message.message_id}.jpg",
                "mime": "image/jpeg",
                "size": largest.file_size,
            }
        )
    if message.document:
        document = message.document
        items.append(
            {
                "file_id": document.file_id,
                "kind": "document",
                "name": document.file_name or f"document_{message.message_id}",
                "mime": document.mime_type or "application/octet-stream",
                "size": document.file_size,
            }
        )
    return items


async def download_attachments(bot: Bot, attachments: list[dict[str, Any]] | None) -> list[DownloadedFile]:
    files: list[DownloadedFile] = []
    for item in attachments or []:
        if (item.get("size") or 0) > TELEGRAM_DOWNLOAD_LIMIT_BYTES:
            logger.info("Skipping Telegram file %s: too large for the Bot API", item.get("name"))
            continue
        try:
            buffer = await bot.download(item["file_id"])
        except TelegramAPIError:
            logger.exception("Could not download Telegram file %s", item.get("name"))
            continue
        if buffer is None:
            continue
        files.append(
            DownloadedFile(
                name=str(item.get("name") or "file"),
                mime=str(item.get("mime") or "application/octet-stream"),
                content=buffer.read(),
            )
        )
    return files
