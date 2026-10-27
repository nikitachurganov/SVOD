from __future__ import annotations

import asyncio
import io
import re
import uuid
from pathlib import Path

import boto3
from botocore.client import BaseClient
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.metrics import S3_ERRORS


def _client(*, public: bool = False) -> BaseClient:
    return boto3.client(
        "s3",
        endpoint_url=(settings.S3_PUBLIC_ENDPOINT_URL if public else settings.S3_ENDPOINT_URL) or None,
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
    )


async def ensure_bucket() -> None:
    client = _client()

    def _ensure() -> None:
        try:
            client.head_bucket(Bucket=settings.S3_BUCKET)
        except ClientError:
            client.create_bucket(Bucket=settings.S3_BUCKET)

    await asyncio.to_thread(_ensure)


def build_object_key(request_id: int, stage_id: uuid.UUID, filename: str) -> str:
    suffix = re.sub(r"[^a-zA-Z0-9.]", "", Path(filename).suffix)[:16]
    return f"requests/{request_id}/stages/{stage_id}/{uuid.uuid4()}{suffix}"


def build_form_object_key(request_id: int, field_id: str, filename: str) -> str:
    safe_field = re.sub(r"[^a-zA-Z0-9_-]", "", field_id)[:80] or "field"
    suffix = re.sub(r"[^a-zA-Z0-9.]", "", Path(filename).suffix)[:16]
    return f"requests/{request_id}/form/{safe_field}/{uuid.uuid4()}{suffix}"


def build_avatar_key(user_id: uuid.UUID, extension: str) -> str:
    return f"avatars/{user_id}/{uuid.uuid4()}{extension}"


def key_from_url(file_url: str) -> str | None:
    """Object key of a stored `s3://bucket/key` URL; None for legacy attachments without a binary."""
    prefix = f"s3://{settings.S3_BUCKET}/"
    return file_url[len(prefix):] if file_url.startswith(prefix) else None


async def upload_bytes(object_key: str, content: bytes, content_type: str | None) -> None:
    if settings.FILE_STORAGE_BACKEND != "s3":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 file storage is not configured",
        )
    try:
        await ensure_bucket()
        client = _client()
        await asyncio.to_thread(
            client.upload_fileobj,
            io.BytesIO(content),
            settings.S3_BUCKET,
            object_key,
            ExtraArgs={"ContentType": content_type or "application/octet-stream"},
        )
    except Exception:
        S3_ERRORS.labels("upload").inc()
        raise


async def delete_object(object_key: str) -> None:
    try:
        client = _client()
        await asyncio.to_thread(client.delete_object, Bucket=settings.S3_BUCKET, Key=object_key)
    except Exception:
        S3_ERRORS.labels("delete").inc()
        raise


async def create_download_url(object_key: str) -> str:
    try:
        client = _client(public=True)
        return await asyncio.to_thread(
            client.generate_presigned_url,
            "get_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": object_key},
            ExpiresIn=settings.S3_PRESIGNED_URL_SECONDS,
        )
    except Exception:
        S3_ERRORS.labels("presign").inc()
        raise
