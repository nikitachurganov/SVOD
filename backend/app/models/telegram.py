import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TelegramAccount(Base):
    """A SVOD user linked to a Telegram account (one to one)."""

    __tablename__ = "telegram_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    telegram_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Organization used by private-chat commands (/new, /free) when the user has several
    current_organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    # Set when Telegram answers 403: the user blocked the bot; cleared on the next /start
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(lazy="selectin")  # noqa: F821


class TelegramLinkToken(Base):
    """One-time token behind the t.me/<bot>?start=<token> deep link."""

    __tablename__ = "telegram_link_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class TelegramRequestSuggestion(Base):
    """A request draft prepared by the bot (from /new text or a group dialog) awaiting confirmation."""

    __tablename__ = "telegram_request_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "private" — /new in a private chat, "group" — detected in a connected group
    source_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    chat_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    initiator_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Group dialog: [{message_id, from_name, text, sent_at}]
    transcript: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # [{file_id, kind, name, mime, size}] — downloaded only when the request is created
    attachments: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    form_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("forms.id", ondelete="SET NULL"), nullable=True
    )
    form_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    form_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    missing_required: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Forms offered by "Сменить форму": [{id, name}]
    form_choices: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", index=True)
    request_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("requests.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    card_chat_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    card_message_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    decided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class TelegramChat(Base):
    """A group chat connected to an organization (one group — one organization)."""

    __tablename__ = "telegram_chats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    connected_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Passive analysis switched off by /pause; /request still works
    paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Messages up to this id were already analyzed
    last_analyzed_message_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class TelegramMessage(Base):
    """A group message kept for analysis; removed after TELEGRAM_MESSAGE_RETENTION_DAYS."""

    __tablename__ = "telegram_messages"
    __table_args__ = (UniqueConstraint("chat_id", "message_id", name="uq_telegram_messages_chat_message"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    message_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    from_telegram_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    reply_to_message_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    attachments: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
