from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class PublicLinkResponse(BaseModel):
    id: str
    organization_id: str
    token: str
    is_active: bool
    created_at: str


class PublicPopularFormSummary(BaseModel):
    """Top forms by usage for the public landing cards."""

    id: str
    name: str
    short_description: str


class PublicFormSummary(BaseModel):
    id: str
    name: str
    description: str
    pages: list[Any]
    is_universal: bool = False


class PublicPageDataResponse(BaseModel):
    """Returned to anonymous users when they open the public request link."""

    organization_name: str
    organization_description: str | None
    forms: list[PublicFormSummary]
    popular_forms: list[PublicPopularFormSummary]
    universal_form_id: str | None = None


class PublicRequestSubmission(BaseModel):
    """Payload an anonymous user POSTs to create a request via public link."""

    full_name: str = Field(..., min_length=1, max_length=500)
    applicant_company: str = Field(..., min_length=1, max_length=500)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)
    form_id: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return v
    title: str = Field(..., min_length=1, max_length=500)
    data: Any = None
    form_snapshot: Any = None

    @field_validator("phone", mode="before")
    @classmethod
    def empty_phone_none(cls, v: str | None) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def require_contact(self) -> "PublicRequestSubmission":
        if self.email is None and self.phone is None:
            raise ValueError("Укажите телефон или email")
        return self


class PublicRequestCreatedResponse(BaseModel):
    id: str
    title: str
    status: str
    created_at: str


class PublicSuggestFormsRequest(BaseModel):
    text: str = Field("", max_length=8000)


class PublicSuggestedFormCard(BaseModel):
    id: str
    name: str
    short_description: str


class PublicSuggestFormsResponse(BaseModel):
    forms: list[PublicSuggestedFormCard]
    hint: str | None = None
    used_llm: bool = False
