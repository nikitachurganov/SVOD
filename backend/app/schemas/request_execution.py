from typing import Any, Literal

from pydantic import BaseModel, Field


class StageAssigneePreviewResponse(BaseModel):
    kind: str
    full_name: str
    email: str | None = None
    # External contractors (no account): how to reach them
    organization: str | None = None
    contact_kind: str | None = None
    contact_value: str | None = None


class RequestStageArtifactResponse(BaseModel):
    id: str
    kind: str
    purpose: Literal["input", "result"] = "result"
    name: str
    url: str | None = None
    content_type: str | None = None
    size: int | None = None
    created_by_user_id: str | None = None
    created_at: str


class RequestStageResponse(BaseModel):
    id: str
    request_id: str
    sequence: int
    title: str
    description: str | None = None
    expected_result: str | None = None
    recommended_role: str | None = None
    due_date: str | None = None
    is_overdue: bool = False
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
    artifacts: list[RequestStageArtifactResponse] = Field(default_factory=list)


class RequestExecutionEventResponse(BaseModel):
    id: str
    request_id: str
    stage_id: str | None = None
    event_type: str
    actor_user_id: str | None = None
    actor_name: str | None = None
    message: str | None = None
    payload: dict[str, Any] | None = None
    created_at: str


class AddRequestStagePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    expected_result: str | None = Field(default=None, max_length=10_000)
    recommended_role: str | None = Field(default=None, max_length=500)
    due_date: str | None = None
    source: str | None = None


class PatchRequestStagePayload(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    expected_result: str | None = Field(default=None, max_length=10_000)
    recommended_role: str | None = Field(default=None, max_length=500)
    due_date: str | None = None


class CompleteStagePayload(BaseModel):
    result_summary: str | None = Field(default=None, max_length=20_000)
    artifact_ids: list[str] = Field(default_factory=list, max_length=20)


class BlockStagePayload(BaseModel):
    reason: str = Field(..., min_length=1, max_length=5_000)


class UnblockStagePayload(BaseModel):
    pass


class ReorderStagesPayload(BaseModel):
    stage_ids: list[str] = Field(..., min_length=1)


class AddStageLinkPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    url: str = Field(..., min_length=8, max_length=5000)
    purpose: Literal["input", "result"] = "input"


class StageTechnicalSpecResponse(BaseModel):
    id: str
    version: int
    status: Literal["draft", "confirmed"]
    source: str
    sections: dict[str, Any] = Field(default_factory=dict)
    generated_at: str
    confirmed_at: str | None = None


class PatchStageTechnicalSpecPayload(BaseModel):
    sections: dict[str, Any] = Field(default_factory=dict)


class StageHandoffResponse(BaseModel):
    id: str
    specification_id: str | None = None
    specification_version: int | None = None
    specification_snapshot: dict[str, Any] | None = None
    assignee_kind: str
    assignee_id: str | None = None
    assignee_name: str
    assigned_by_user_id: str | None = None
    assigned_by_name: str
    due_date: str | None = None
    materials_snapshot: list[dict[str, Any]] = Field(default_factory=list)
    assigned_at: str


class RequestTimelineStageResponse(RequestStageResponse):
    specifications: list[StageTechnicalSpecResponse] = Field(default_factory=list)
    handoffs: list[StageHandoffResponse] = Field(default_factory=list)
    input_artifacts: list[RequestStageArtifactResponse] = Field(default_factory=list)
    result_artifacts: list[RequestStageArtifactResponse] = Field(default_factory=list)
    events: list[RequestExecutionEventResponse] = Field(default_factory=list)


class RequestTimelineResponse(BaseModel):
    request_id: str
    stages: list[RequestTimelineStageResponse] = Field(default_factory=list)
    events: list[RequestExecutionEventResponse] = Field(default_factory=list)
    next_before: str | None = None
