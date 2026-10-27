from prometheus_client import Counter, Gauge, Histogram


REQUEST_API_ERRORS = Counter(
    "svod_request_api_errors_total",
    "Rejected or failed request workflow API operations",
    ("method", "status"),
)
AI_JOB_DURATION = Histogram(
    "svod_ai_job_duration_seconds",
    "AI background job duration",
    ("kind", "outcome"),
)
AI_JOB_RETRIES = Counter(
    "svod_ai_job_retries_total",
    "AI job retries",
    ("kind",),
)
S3_ERRORS = Counter(
    "svod_s3_errors_total",
    "S3 operation errors",
    ("operation",),
)
AI_ACTIONS = Counter(
    "svod_ai_actions_total",
    "Metered AI actions (a survey build, a summary, a chat answer)",
    ("action", "status"),
)
AI_TOKENS = Counter(
    "svod_ai_tokens_total",
    "Tokens used by metered AI actions",
    ("direction", "action"),
)
AI_COST_USD = Counter(
    "svod_ai_cost_usd_total",
    "Cost of metered AI actions in US dollars (reported by OpenRouter, else estimated from tokens)",
    ("action",),
)
BILLING_LIMIT_HIT = Counter(
    "svod_billing_limit_hit_total",
    "Plan limits reached; enforced=false is what shadow mode would have blocked",
    ("limit", "plan", "enforced"),
)
PAYMENTS = Counter(
    "svod_payments_total",
    "Online payments by outcome: created, succeeded, canceled, refunded, mismatch, provider_error",
    ("outcome",),
)
OVERDUE_STAGES = Gauge(
    "svod_overdue_stages",
    "Current number of overdue unfinished stages",
)
NOTIFICATION_SKIPPED = Counter(
    "svod_notification_skipped_total",
    "Notifications skipped because no recipient was available",
    ("type",),
)
