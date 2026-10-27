from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.name_utils import normalize_name_part

Occupation = Literal["student", "researcher", "marketer", "hr", "teacher", "business", "other"]
Purpose = Literal["study", "science", "marketing", "hr", "customer_service", "events", "other"]
Source = Literal["search", "recommendation", "social", "telegram", "blog", "university", "ads", "other"]
TourStatus = Literal["pending", "accepted", "declined", "completed"]

OTHER = "other"
OTHER_MAX_LENGTH = 200


class OnboardingSurveyRequest(BaseModel):
    """Answers of the first-visit questionnaire; the free text is kept only next to «Другое»."""

    occupation: Occupation
    occupation_other: str | None = Field(None, max_length=OTHER_MAX_LENGTH)
    purposes: list[Purpose] = Field(..., min_length=1, max_length=len(Purpose.__args__))
    purpose_other: str | None = Field(None, max_length=OTHER_MAX_LENGTH)
    source: Source
    source_other: str | None = Field(None, max_length=OTHER_MAX_LENGTH)

    @field_validator("occupation_other", "purpose_other", "source_other", mode="before")
    @classmethod
    def normalize_free_text(cls, value: str | None) -> str | None:
        return normalize_name_part(value) if isinstance(value, str) else None

    @field_validator("purposes")
    @classmethod
    def drop_duplicate_purposes(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class TourUpdateRequest(BaseModel):
    status: TourStatus
    # Where the tour stopped, so it can continue from there; the steps are defined by the web client
    step: str | None = Field(None, max_length=64)
