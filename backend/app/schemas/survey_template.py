from typing import Any

from pydantic import BaseModel, Field, field_validator


class SurveyTemplateItem(BaseModel):
    id: str
    name: str
    description: str
    methodology_id: str
    questions_count: int


class SurveyTemplateDetail(SurveyTemplateItem):
    pages: list[dict[str, Any]]
    methodology_meta: dict[str, Any]


class CreateSurveyFromTemplateRequest(BaseModel):
    template_id: str
    organization_id: str
    project_id: str | None = None
    name: str = Field(min_length=1, max_length=500)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Укажите название исследования")
        return value
