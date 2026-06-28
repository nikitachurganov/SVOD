from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.core.name_utils import normalize_name_part


class RegisterRequest(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    middle_name: str | None = Field(None, max_length=100)
    # Backward compatibility for legacy clients during transition.
    full_name: str | None = Field(None, min_length=2, max_length=255)
    email: EmailStr
    phone_number: str = Field(default="", max_length=20)
    password: str = Field(..., min_length=8, max_length=64)

    @field_validator("first_name", "last_name", "middle_name", "full_name", mode="before")
    @classmethod
    def normalize_name_values(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_name_part(value)

    @field_validator("phone_number", mode="before")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str:
        if value is None:
            return ""
        return value.strip()

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must not exceed 72 bytes.")
        return value

    @model_validator(mode="after")
    def ensure_name_parts(self) -> "RegisterRequest":
        if self.first_name and self.last_name:
            return self

        if self.full_name:
            parts = self.full_name.split()
            if len(parts) >= 2:
                self.last_name = parts[0]
                self.first_name = parts[1]
                self.middle_name = " ".join(parts[2:]) or None
                return self

        raise ValueError(
            "first_name and last_name are required. Legacy full_name must include at least two words."
        )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"