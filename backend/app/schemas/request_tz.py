from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class RequestTZSections(BaseModel):
    """Structured technical specification content for the performer."""

    title: str = ""
    short_description: str = ""
    goal: str = ""
    tasks: list[str] = Field(default_factory=list)
    expected_result: str = ""
    inputs: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    deadline: str | None = None
    acceptance_criteria: list[str] = Field(default_factory=list)
    clarifications_and_risks: list[str] = Field(default_factory=list)
    missing_or_unclear: list[str] = Field(default_factory=list)


class RequestTZStored(BaseModel):
    """Stored envelope in requests.ai_tz."""

    status: Literal["draft", "confirmed"] = "draft"
    generated_at: str = ""
    confirmed_at: str | None = None
    sections: RequestTZSections = Field(default_factory=RequestTZSections)


class RequestTZResponse(BaseModel):
    """API shape for GET/POST tz — mirrors stored JSON."""

    status: Literal["draft", "confirmed"]
    generated_at: str
    confirmed_at: str | None
    sections: RequestTZSections


class PatchRequestTZPayload(BaseModel):
    """Partial update: merge sections keys; optionally set status to confirmed."""

    sections: dict[str, Any] | None = None
    status: Literal["draft", "confirmed"] | None = None
