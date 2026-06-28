from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.constants import request_workflow as W
from app.schemas.user import PublicAuthorResponse


class PatchWorkflowStatusPayload(BaseModel):
    status: str = Field(..., min_length=1)
    comment: str | None = Field(default=None, max_length=2000)
    force_complete: bool = False

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in W.WORKFLOW_STATUSES:
            raise ValueError(f"Invalid workflow status: {value}")
        return value


class RequestTaskAssigneePreview(BaseModel):
    id: str
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    email: str | None = None


class RequestTaskResponse(BaseModel):
    id: str
    request_id: str
    title: str
    description: str | None = None
    status: str
    assignee_id: str | None = None
    assignee: RequestTaskAssigneePreview | None = None
    created_by_id: str | None = None
    created_by: PublicAuthorResponse | None = None
    priority: str
    due_date: str | None = None
    is_required: bool
    order_index: int
    created_at: str
    updated_at: str
    completed_at: str | None = None


class CreateRequestTaskPayload(BaseModel):
    title: str = Field(..., min_length=3, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    status: str = W.TASK_TODO
    assignee_id: str | None = None
    priority: str = W.PRIORITY_MEDIUM
    due_date: str | None = None
    is_required: bool = False
    order_index: int | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in W.TASK_STATUSES:
            raise ValueError(f"Invalid task status: {value}")
        return value

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str) -> str:
        if value not in W.PRIORITIES:
            raise ValueError(f"Invalid priority: {value}")
        return value


class UpdateRequestTaskPayload(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    status: str | None = None
    assignee_id: str | None = None
    priority: str | None = None
    due_date: str | None = None
    is_required: bool | None = None
    order_index: int | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in W.TASK_STATUSES:
            raise ValueError(f"Invalid task status: {value}")
        return value

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str | None) -> str | None:
        if value is not None and value not in W.PRIORITIES:
            raise ValueError(f"Invalid priority: {value}")
        return value


class PatchRequestTaskStatusPayload(BaseModel):
    status: str = Field(..., min_length=1)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in W.TASK_STATUSES:
            raise ValueError(f"Invalid task status: {value}")
        return value


class PatchRequestTaskAssigneePayload(BaseModel):
    assignee_id: str | None = None


class RequestHistoryActorResponse(BaseModel):
    id: str
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    email: str | None = None


class RequestHistoryEventResponse(BaseModel):
    id: str
    request_id: str
    actor_id: str | None = None
    actor: RequestHistoryActorResponse | None = None
    type: str
    payload: dict[str, Any] | None = None
    created_at: str


class WorkflowStatusSuggestion(BaseModel):
    suggested_status: str
    reason: str
