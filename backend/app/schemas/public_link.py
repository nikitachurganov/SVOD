from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class PublicLinkResponse(BaseModel):
    id: str
    organization_id: str
    token: str
    is_active: bool
    created_at: str


class PublicLinkInfo(BaseModel):
    active: bool = True
    custom_title: str | None = None
    custom_description: str | None = None


class PublicOrganizationInfo(BaseModel):
    id: str
    name: str
    logo_url: str | None = None
    description: str | None = None


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
    field_count: int = 0


class PublicPageDataResponse(BaseModel):
    """Returned to anonymous users when they open the public request link."""

    organization_name: str
    organization_description: str | None
    forms: list[PublicFormSummary]
    popular_forms: list[PublicPopularFormSummary]
    universal_form_id: str | None = None
    organization: PublicOrganizationInfo | None = None
    link: PublicLinkInfo | None = None


class PublicRequestSubmission(BaseModel):
    """Payload an anonymous user POSTs to create a request via public link."""

    full_name: str = Field(..., min_length=1, max_length=500)
    applicant_company: str | None = Field(None, max_length=500)
    email: EmailStr
    phone: str | None = Field(None, max_length=50)
    form_id: str
    applicant_description: str | None = Field(None, max_length=8000)

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

    @field_validator("applicant_company", mode="before")
    @classmethod
    def empty_company_none(cls, v: str | None) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def require_email(self) -> "PublicRequestSubmission":
        if self.email is None:
            raise ValueError("Укажите email")
        return self


class PublicRequestCreatedResponse(BaseModel):
    id: str
    title: str
    status: str
    created_at: str
    request_id: str | None = None
    request_number: str | None = None

    @model_validator(mode="after")
    def fill_request_aliases(self) -> "PublicRequestCreatedResponse":
        if self.request_id is None:
            self.request_id = self.id
        if self.request_number is None:
            self.request_number = str(self.id)
        return self


class PublicSuggestFormsRequest(BaseModel):
    text: str = Field("", max_length=8000)
    description: str | None = Field(None, max_length=8000)

    @model_validator(mode="after")
    def merge_description(self) -> "PublicSuggestFormsRequest":
        if self.description and self.description.strip():
            self.text = self.description.strip()
        return self


class PublicSuggestedFormCard(BaseModel):
    id: str
    name: str
    short_description: str
    field_count: int = 0
    relevance_score: float = 0.0
    reason: str = ""


class PublicSuggestFormsResponse(BaseModel):
    forms: list[PublicSuggestedFormCard]
    suggestions: list[PublicSuggestedFormCard] | None = None
    hint: str | None = None
    used_llm: bool = False

    @model_validator(mode="after")
    def mirror_suggestions(self) -> "PublicSuggestFormsResponse":
        if self.suggestions is None:
            self.suggestions = self.forms
        return self
