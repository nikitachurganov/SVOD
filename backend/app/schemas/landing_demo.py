from pydantic import BaseModel, Field


class LandingDemoRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=1000)
    # Sent by the landing for its own bookkeeping; the limits go by IP
    client_session_id: str | None = Field(default=None, max_length=100)


class LandingDemoScaleLabels(BaseModel):
    min: str
    max: str


class LandingDemoQuestion(BaseModel):
    """A question as the landing draws it: a few simple kinds instead of the field types."""

    id: str
    number: int
    type: str
    typeLabel: str
    text: str
    options: list[str] | None = None
    scaleLabels: LandingDemoScaleLabels | None = None
    required: bool = True


class LandingDemoResponse(BaseModel):
    draft_id: str
    title: str
    methodology: str
    description: str
    total_questions: int
    questions: list[LandingDemoQuestion]
    ai_summary: str
