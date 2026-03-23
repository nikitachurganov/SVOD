from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/myapp"
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: list[str] = ["https://servicedev.space"]
    FILE_STORAGE_BACKEND: str = "local"
    FILE_STORAGE_BASE_URL: str = "http://localhost:8000/uploads"

    GIGACHAT_AUTH_KEY: str
    GIGACHAT_SCOPE: str
    GIGACHAT_MODEL: str

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @field_validator("GIGACHAT_AUTH_KEY", "GIGACHAT_SCOPE", "GIGACHAT_MODEL")
    @classmethod
    def _must_not_be_empty(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("must not be empty")
        return value


settings = Settings()