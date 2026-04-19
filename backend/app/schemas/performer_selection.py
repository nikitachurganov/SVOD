from typing import Literal

from pydantic import BaseModel, Field


class RecommendationFallback(BaseModel):
    required_role: str
    recommended_sources: list[str]
    geography: str


class RecommendedPerformerItem(BaseModel):
    id: str
    full_name: str
    position: str
    organization: str | None = None
    is_internal: bool
    score: int = Field(ge=0, le=100)
    reasons: list[str]
    warnings: list[str]
    active_tasks: int = Field(ge=0)
    contact_available: bool


class PerformerRecommendationResponse(BaseModel):
    status: Literal["strong_match", "partial_match", "no_match"]
    confidence: int = Field(ge=0, le=100)
    recommended_performer_id: str | None = None
    performers: list[RecommendedPerformerItem]
    fallback: RecommendationFallback


class AssignRequestPayload(BaseModel):
    performer_id: str = Field(..., min_length=5)
    send_tz: bool = False
    contact_method: str = Field(default="email", min_length=2, max_length=50)
    recommended_performer_id: str | None = Field(
        default=None,
        description="Top recommendation id from GET /performers — used for override analytics.",
    )


class PerformerAnalyticsPayload(BaseModel):
    event: Literal["view", "assign", "override", "missing_contact"]
    performer_id: str | None = None
    payload: dict | None = None
