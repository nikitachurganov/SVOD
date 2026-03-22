from typing import Any

from pydantic import BaseModel, Field

from app.schemas.user import PublicAuthorResponse


class CreateFormRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    pages: list[Any] = Field(default_factory=list)
    organization_id: str | None = None


class UpdateFormRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    pages: list[Any] = Field(default_factory=list)


class FormResponse(BaseModel):
    id: str
    name: str
    description: str
    pages: list[Any]
    organization_id: str | None
    created_by_user_id: str | None
    author: PublicAuthorResponse | None
    created_at: str
    updated_at: str
