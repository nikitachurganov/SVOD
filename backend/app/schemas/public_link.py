from typing import Any

from pydantic import BaseModel, EmailStr, Field


class PublicLinkResponse(BaseModel):
    id: str
    organization_id: str
    token: str
    is_active: bool
    created_at: str


class PublicPageDataResponse(BaseModel):
    """Returned to anonymous users when they open the public request link."""
    organization_name: str
    organization_description: str | None
    forms: list["PublicFormSummary"]


class PublicFormSummary(BaseModel):
    id: str
    name: str
    description: str
    pages: list[Any]


class PublicRequestSubmission(BaseModel):
    """Payload an anonymous user POSTs to create a request via public link."""
    full_name: str = Field(..., min_length=1, max_length=500)
    email: EmailStr
    phone: str = Field("", max_length=50)
    form_id: str
    title: str = Field(..., min_length=1, max_length=500)
    data: Any = None
    form_snapshot: Any = None


class PublicRequestCreatedResponse(BaseModel):
    id: str
    title: str
    status: str
    created_at: str
