from typing import Any

from pydantic import BaseModel, Field


class StageAssigneePreviewResponse(BaseModel):
    kind: str
    full_name: str
    email: str | None = None


class RequestStageResponse(BaseModel):
    id: str
    request_id: str
    sequence: int
    title: str
    description: str | None = None
    assignee_kind: str | None = None
    performer_id: str | None = None
    assignee_preview: StageAssigneePreviewResponse | None = None
    status: str
    blocked_reason: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    completed_by_user_id: str | None = None
    result_summary: str | None = None
    source: str
    template_key: str | None = None
    created_at: str
    updated_at: str


class RequestExecutionEventResponse(BaseModel):
    id: str
    request_id: str
    stage_id: str | None = None
    event_type: str
    actor_user_id: str | None = None
    payload: dict[str, Any] | None = None
    created_at: str


class AddRequestStagePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    source: str | None = None


class PatchRequestStagePayload(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)


class CompleteStagePayload(BaseModel):
    result_summary: str | None = Field(default=None, max_length=20_000)


class BlockStagePayload(BaseModel):
    reason: str = Field(..., min_length=1, max_length=5_000)


class UnblockStagePayload(BaseModel):
    pass
