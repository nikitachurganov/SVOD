from typing import Any

from pydantic import BaseModel, Field

from app.schemas.user import PublicAuthorResponse


class CreateRequestPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    form_id: str
    organization_id: str | None = None
    data: Any = None
    status: str = "open"
    form_snapshot: Any = None


class UpdateRequestPayload(BaseModel):
    title: str | None = None
    status: str | None = None
    closedAt: str | None = None
    data: Any = None


class PatchStatusPayload(BaseModel):
    status: str = Field(..., min_length=1)


class AISummaryResponse(BaseModel):
    summary: str
    priority: str
    tags: list[str]


class RequestPersonResponse(BaseModel):
    """A person related to a request (author, assignee, etc.)."""
    role: str
    name: str
    email: str | None = None
    phone: str | None = None
    source: str


class RequestResponse(BaseModel):
    id: str
    title: str
    form_id: str
    organization_id: str | None
    data: Any
    status: str
    closedAt: str | None
    created_by_user_id: str | None
    author: PublicAuthorResponse | None
    created_at: str
    updated_at: str
    form_snapshot: Any | None = None
    ai_summary: AISummaryResponse | None = None
    source: str | None = None
    applicant_name: str | None = None
    applicant_email: str | None = None
    applicant_phone: str | None = None
    people: list[RequestPersonResponse] = []
