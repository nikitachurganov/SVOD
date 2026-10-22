from typing import Any, Literal

from pydantic import BaseModel, Field


class FormAiChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)


class FormAiBuildRequest(BaseModel):
    messages: list[FormAiChatMessage] = Field(..., min_length=1, max_length=40)
    title: str = ""
    pages: list[Any] = Field(default_factory=list)


class FormAiBuildResponse(BaseModel):
    reply: str
    title: str | None = None
    # None — the model decided not to change the form (e.g. answered a question)
    pages: list[dict[str, Any]] | None = None
