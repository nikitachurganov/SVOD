from typing import Any

from pydantic import BaseModel, Field


class AIJobResponse(BaseModel):
    id: str
    request_id: str
    kind: str
    status: str
    error: str | None = None
    result: dict[str, Any] | None = None
    created_at: str
    updated_at: str


class AIStagePlanItem(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    expected_result: str | None = Field(default=None, max_length=10_000)
    role_hint: str | None = Field(default=None, max_length=500)
    estimated_duration_days: int | None = Field(default=None, ge=1, le=365)
    technical_spec: dict[str, Any] | None = None
    recommended_performers: list[dict[str, Any]] = Field(default_factory=list)


class AIStagePlanResponse(BaseModel):
    status: str
    source_fingerprint: str
    stages: list[AIStagePlanItem]
    generated_at: str


class ApplyAIStagePlanPayload(BaseModel):
    stages: list[AIStagePlanItem] | None = None
