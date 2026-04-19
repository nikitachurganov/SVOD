from decimal import Decimal

from pydantic import BaseModel, Field


class CreateExternalContractorPayload(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=500)
    organization: str | None = Field(default=None, max_length=500)
    specialization: str | None = None
    position: str | None = Field(default=None, max_length=300)
    geography: str | None = Field(default=None, max_length=300)
    contact_kind: str | None = Field(default=None, max_length=50)
    contact_value: str | None = Field(default=None, max_length=500)
    rating: Decimal | None = Field(default=None, ge=0, le=10)


class ExternalContractorResponse(BaseModel):
    id: str
    full_name: str
    organization: str | None
    specialization: str | None
    position: str | None
    geography: str | None
    contact_kind: str | None
    contact_value: str | None
    rating: float | None
