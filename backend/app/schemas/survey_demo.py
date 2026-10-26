from pydantic import BaseModel, Field

DEFAULT_DEMO_RESPONSES = 25
MAX_DEMO_RESPONSES = 50


class DemoResponsesRequest(BaseModel):
    count: int = Field(DEFAULT_DEMO_RESPONSES, ge=5, le=MAX_DEMO_RESPONSES)


class DemoResponsesResult(BaseModel):
    created: int


class DemoResponsesRemoved(BaseModel):
    removed: int
