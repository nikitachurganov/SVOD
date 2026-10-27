"""Profile photo: stored in the private bucket, shown through short-lived signed links."""

import logging

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.services import storage_service

logger = logging.getLogger(__name__)

_UNSUPPORTED_TYPE = "Подходит фото в формате JPEG, PNG или WebP"
_EMPTY_FILE = "Файл пустой"


def _image_extension(content: bytes) -> str | None:
    """Type by the file signature: the type the browser reports is not trusted."""
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    return None


def _content_type(extension: str) -> str:
    return {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}[extension]


def _max_size_text() -> str:
    return f"{settings.AVATAR_MAX_BYTES // (1024 * 1024)} МБ"


async def resolve_url(avatar_url: str | None) -> str | None:
    """Signed link to show the photo; None when there is no photo or it cannot be reached right now."""
    if not avatar_url or settings.FILE_STORAGE_BACKEND != "s3":
        return None
    key = storage_service.key_from_url(avatar_url)
    if key is None:
        return None
    try:
        return await storage_service.create_download_url(key)
    except Exception:  # noqa: BLE001 - a storage hiccup must not break loading the profile
        logger.warning("Could not sign the avatar link of a user", exc_info=True)
        return None


async def _delete_object_quietly(avatar_url: str | None) -> None:
    key = storage_service.key_from_url(avatar_url) if avatar_url else None
    if key is None:
        return
    try:
        await storage_service.delete_object(key)
    except Exception:  # noqa: BLE001 - a stray object is better than a failed request
        logger.warning("Could not delete the stored avatar %s", key, exc_info=True)


async def set_avatar(session: AsyncSession, user: User, upload: UploadFile) -> None:
    """Replace the photo; the previous file is removed once the new one is saved."""
    content = await upload.read(settings.AVATAR_MAX_BYTES + 1)
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_EMPTY_FILE)
    if len(content) > settings.AVATAR_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Файл слишком большой: не более {_max_size_text()}",
        )
    extension = _image_extension(content)
    if extension is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_UNSUPPORTED_TYPE)

    object_key = storage_service.build_avatar_key(user.id, extension)
    await storage_service.upload_bytes(object_key, content, _content_type(extension))

    previous = user.avatar_url
    user.avatar_url = f"s3://{settings.S3_BUCKET}/{object_key}"
    try:
        await session.commit()
    except Exception:
        await _delete_object_quietly(user.avatar_url)
        raise
    await _delete_object_quietly(previous)


async def remove_avatar(session: AsyncSession, user: User) -> None:
    previous = user.avatar_url
    if previous is None:
        return
    user.avatar_url = None
    await session.commit()
    await _delete_object_quietly(previous)
