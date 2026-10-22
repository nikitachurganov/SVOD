from pydantic import BaseModel


class TelegramStatusResponse(BaseModel):
    # False when the bot is not configured on the server (no token/username)
    enabled: bool
    linked: bool
    bot_username: str | None = None
    username: str | None = None
    display_name: str | None = None
    linked_at: str | None = None


class TelegramLinkResponse(BaseModel):
    url: str
    expires_at: str


class TelegramTranscriptMessage(BaseModel):
    from_name: str | None = None
    text: str
    sent_at: str | None = None


class TelegramRequestSourceResponse(BaseModel):
    # "private" — described to the bot via /new, "group" — detected in a group dialog
    source_kind: str
    chat_title: str | None = None
    source_text: str
    summary: str | None = None
    transcript: list[TelegramTranscriptMessage] = []
    # Link to the first dialog message (supergroups only)
    message_url: str | None = None
    confirmed_by: str | None = None
    created_at: str
