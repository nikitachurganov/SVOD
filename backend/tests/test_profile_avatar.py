from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.services import avatar_service

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"0" * 32
GIF = b"GIF89a" + b"0" * 32


class FakeUpload:
    """Stands in for fastapi.UploadFile: only `read(size)` is used."""

    def __init__(self, content: bytes):
        self._content = content

    async def read(self, size: int = -1) -> bytes:
        return self._content if size < 0 else self._content[:size]


def user_ns(**overrides):
    data = dict(id=uuid.uuid4(), avatar_url=None)
    data.update(overrides)
    return SimpleNamespace(**data)


def session_mock():
    session = MagicMock()
    session.commit = AsyncMock()
    return session


class AvatarTestCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        storage = avatar_service.storage_service
        self.upload = self._patch(storage, "upload_bytes", AsyncMock())
        self.delete = self._patch(storage, "delete_object", AsyncMock())
        self.sign = self._patch(storage, "create_download_url", AsyncMock(return_value="https://signed/x"))
        self._patch(avatar_service.settings, "FILE_STORAGE_BACKEND", "s3")
        self._patch(avatar_service.settings, "AVATAR_MAX_BYTES", 1024)
        self.bucket = avatar_service.settings.S3_BUCKET

    def _patch(self, target, name, value):
        patcher = patch.object(target, name, value)
        patcher.start()
        self.addCleanup(patcher.stop)
        return getattr(target, name)


class SetAvatarTests(AvatarTestCase):
    async def test_supported_images_are_stored_by_their_signature(self):
        for content, extension, content_type in (
            (PNG, ".png", "image/png"),
            (JPEG, ".jpg", "image/jpeg"),
            (WEBP, ".webp", "image/webp"),
        ):
            with self.subTest(extension=extension):
                self.upload.reset_mock()
                user, session = user_ns(), session_mock()

                await avatar_service.set_avatar(session, user, FakeUpload(content))

                key, stored, stored_type = self.upload.await_args.args
                self.assertTrue(key.startswith(f"avatars/{user.id}/") and key.endswith(extension))
                self.assertEqual((stored, stored_type), (content, content_type))
                self.assertEqual(user.avatar_url, f"s3://{self.bucket}/{key}")
                session.commit.assert_awaited_once()

    async def test_replacing_removes_the_previous_file_after_commit(self):
        user = user_ns(avatar_url=f"s3://{self.bucket}/avatars/old.png")
        order: list[str] = []
        session = session_mock()
        session.commit.side_effect = lambda: order.append("commit")
        self.delete.side_effect = lambda key: order.append(f"delete:{key}")

        await avatar_service.set_avatar(session, user, FakeUpload(PNG))

        self.assertEqual(order, ["commit", "delete:avatars/old.png"])

    async def test_unsupported_content_is_refused_whatever_the_name_says(self):
        user, session = user_ns(), session_mock()
        with self.assertRaises(HTTPException) as ctx:
            await avatar_service.set_avatar(session, user, FakeUpload(GIF))

        self.assertEqual(ctx.exception.status_code, 422)
        self.upload.assert_not_awaited()
        session.commit.assert_not_awaited()
        self.assertIsNone(user.avatar_url)

    async def test_empty_and_oversized_files_are_refused(self):
        for content, code in ((b"", 422), (PNG + b"0" * 2048, 413)):
            with self.subTest(code=code):
                with self.assertRaises(HTTPException) as ctx:
                    await avatar_service.set_avatar(session_mock(), user_ns(), FakeUpload(content))
                self.assertEqual(ctx.exception.status_code, code)
        self.upload.assert_not_awaited()

    async def test_failed_cleanup_of_the_previous_file_does_not_fail_the_upload(self):
        self.delete.side_effect = RuntimeError("s3 down")
        user = user_ns(avatar_url=f"s3://{self.bucket}/avatars/old.png")

        await avatar_service.set_avatar(session_mock(), user, FakeUpload(PNG))

        self.assertNotIn("old.png", user.avatar_url)

    async def test_failed_commit_removes_the_new_file(self):
        session = session_mock()
        session.commit.side_effect = RuntimeError("db down")
        user = user_ns()

        with self.assertRaises(RuntimeError):
            await avatar_service.set_avatar(session, user, FakeUpload(PNG))

        self.delete.assert_awaited_once()


class RemoveAvatarTests(AvatarTestCase):
    async def test_photo_is_cleared_and_file_deleted(self):
        user = user_ns(avatar_url=f"s3://{self.bucket}/avatars/a.png")
        session = session_mock()

        await avatar_service.remove_avatar(session, user)

        self.assertIsNone(user.avatar_url)
        session.commit.assert_awaited_once()
        self.delete.assert_awaited_once_with("avatars/a.png")

    async def test_nothing_happens_without_a_photo(self):
        session = session_mock()

        await avatar_service.remove_avatar(session, user_ns())

        session.commit.assert_not_awaited()
        self.delete.assert_not_awaited()


class ResolveUrlTests(AvatarTestCase):
    async def test_stored_photo_gets_a_signed_link(self):
        url = await avatar_service.resolve_url(f"s3://{self.bucket}/avatars/a.png")

        self.assertEqual(url, "https://signed/x")
        self.sign.assert_awaited_once_with("avatars/a.png")

    async def test_no_photo_or_unknown_format_gives_nothing(self):
        for stored in (None, "", "https://elsewhere/pic.png"):
            with self.subTest(stored=stored):
                self.assertIsNone(await avatar_service.resolve_url(stored))
        self.sign.assert_not_awaited()

    async def test_signing_failure_does_not_break_the_profile(self):
        self.sign.side_effect = RuntimeError("s3 down")

        self.assertIsNone(await avatar_service.resolve_url(f"s3://{self.bucket}/avatars/a.png"))

    async def test_without_s3_nothing_is_signed(self):
        with patch.object(avatar_service.settings, "FILE_STORAGE_BACKEND", "local"):
            self.assertIsNone(await avatar_service.resolve_url(f"s3://{self.bucket}/avatars/a.png"))
        self.sign.assert_not_awaited()
