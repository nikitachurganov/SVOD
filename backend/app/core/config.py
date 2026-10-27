from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/myapp"
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    # Include local Vite dev server; browsers send OPTIONS preflight — wrong list → 400 on OPTIONS.
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://servicedev.space",
    ]
    FILE_STORAGE_BACKEND: str = "s3"
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_PUBLIC_ENDPOINT_URL: str = "http://localhost:9000"
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str = "svod-private"
    S3_ACCESS_KEY_ID: str = "minio"
    S3_SECRET_ACCESS_KEY: str = "minio-secret"
    S3_PRESIGNED_URL_SECONDS: int = 900
    MAX_UPLOAD_SIZE_BYTES: int = 20 * 1024 * 1024
    # Profile photo (JPEG/PNG/WebP)
    AVATAR_MAX_BYTES: int = 2 * 1024 * 1024
    AI_JOBS_ENABLED: bool = True
    AI_WORKER_POLL_SECONDS: float = 2.0
    AI_JOB_MAX_ATTEMPTS: int = 3
    AI_JOB_STALE_SECONDS: int = 900
    WORKER_METRICS_PORT: int = 9101

    OPENROUTER_API_KEY: str
    OPENROUTER_MODEL: str = "z-ai/glm-5.3-flash"
    # Reasoning effort for OpenRouter (minimal|low|medium|high); empty — provider default.
    # Our prompts ask for structured JSON, long hidden reasoning only eats the token budget.
    OPENROUTER_REASONING_EFFORT: str = "low"
    # Public URL of the web app — used to build links in emails (account activation etc.)
    APP_PUBLIC_URL: str = "http://localhost:5173"
    INVITATION_TTL_DAYS: int = 7
    # Public URL of the standalone surveys service: password reset links for its users point here.
    # Empty — the links use APP_PUBLIC_URL.
    SURVEYS_APP_PUBLIC_URL: str = ""
    PASSWORD_RESET_TTL_MINUTES: int = 60
    # A new reset email for the same account is not sent more often than this
    PASSWORD_RESET_COOLDOWN_SECONDS: int = 60
    EMAIL_VERIFICATION_TTL_HOURS: int = 48
    # A new confirmation email for the same account is not sent more often than this
    EMAIL_VERIFICATION_COOLDOWN_SECONDS: int = 60
    # Outgoing mail. Empty SMTP_HOST disables sending: the owner copies the link manually.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 465
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    # "ssl" (implicit TLS, usually 465) | "starttls" (usually 587) | "none"
    SMTP_SECURITY: str = "ssl"
    SMTP_TIMEOUT_SECONDS: float = 15.0
    # Plans, quotas and the admin panel. Off: nobody is limited, as before billing existed.
    BILLING_ENABLED: bool = False
    # With BILLING_ENABLED, off is the "shadow mode": usage is counted and reported, nothing is blocked.
    BILLING_ENFORCE: bool = False
    # How long a paid plan keeps working after a failed renewal
    BILLING_PAST_DUE_GRACE_DAYS: int = 3
    # The free trial of the paid plan, given once to a person
    BILLING_TRIAL_DAYS: int = 14
    # How often the worker looks for expired subscriptions, reminders and scheduled deletions
    BILLING_TICK_SECONDS: int = 300
    # Where requests for a paid plan are announced (empty: they are only seen in the admin page)
    ADMIN_NOTIFY_EMAIL: str = ""
    # YooKassa online payments: both the shop id and the secret key must be set to accept money
    YOOKASSA_SHOP_ID: str = ""
    YOOKASSA_SECRET_KEY: str = ""
    YOOKASSA_API_URL: str = "https://api.yookassa.ru/v3"
    # Where the person comes back after paying (empty: the subscription tab of the surveys service)
    YOOKASSA_RETURN_URL: str = ""
    # Take notifications only from YooKassa's addresses; each one is re-checked through the API anyway
    YOOKASSA_VERIFY_WEBHOOK_IP: bool = True
    # A payment that is still open after this long is left to the provider and no longer polled
    PAYMENT_PENDING_GIVE_UP_HOURS: int = 72
    # A management key of OpenRouter (not the usual one): lets the worker watch the credit balance.
    # Empty: the balance is not watched, only the failures of the AI calls themselves.
    OPENROUTER_MANAGEMENT_KEY: str = ""
    # The worker warns when the remaining OpenRouter credit falls below this, USD
    OPENROUTER_LOW_BALANCE_USD: float = 5.0
    # The same operational alert is mailed again no sooner than this
    OPS_ALERT_COOLDOWN_MINUTES: int = 360
    # What an AI action cost when OpenRouter did not report it, USD per million tokens
    OPENROUTER_PRICE_IN_USD_PER_M: float = 0.17
    OPENROUTER_PRICE_OUT_USD_PER_M: float = 0.60
    # Roubles per dollar for the AI budgets, with the ~10 % surcharge for topping OpenRouter up from Russia
    AI_COST_RUB_PER_USD: float = 90.0
    # Cap on the AI spending of the whole service per rolling 24 hours, USD. 0 — no cap.
    AI_DAILY_BUDGET_USD: float = 0.0
    DADATA_API_KEY: str = ""
    YANDEX_MAPS_API_KEY: str = ""
    # Telegram bot (python -m app.telegram_bot). Empty token disables the integration.
    TELEGRAM_BOT_TOKEN: str = ""
    # Bot username without "@" — used to build t.me deep links
    TELEGRAM_BOT_USERNAME: str = ""
    TELEGRAM_LINK_TOKEN_TTL_MINUTES: int = 10
    TELEGRAM_POLL_SECONDS: float = 3.0
    # Older undelivered notifications are skipped instead of flooding the chat after downtime
    TELEGRAM_NOTIFICATION_MAX_AGE_HOURS: int = 24
    # Group analysis "by pause": at least N new messages and M seconds of silence
    TELEGRAM_ANALYSIS_MIN_MESSAGES: int = 3
    TELEGRAM_ANALYSIS_IDLE_SECONDS: int = 180
    TELEGRAM_MESSAGE_RETENTION_DAYS: int = 7
    TELEGRAM_SUGGESTION_TTL_HOURS: int = 24

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        # Allows a seamless migration while legacy GIGACHAT_* variables remain in .env.
        "extra": "ignore",
    }

    @field_validator("OPENROUTER_API_KEY", "OPENROUTER_MODEL")
    @classmethod
    def _must_not_be_empty(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("must not be empty")
        return value

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.TELEGRAM_BOT_TOKEN.strip() and self.TELEGRAM_BOT_USERNAME.strip())

    @property
    def payments_enabled(self) -> bool:
        """Online payment is offered only with plans on and both YooKassa credentials set."""
        return bool(
            self.BILLING_ENABLED and self.YOOKASSA_SHOP_ID.strip() and self.YOOKASSA_SECRET_KEY.strip()
        )


settings = Settings()
