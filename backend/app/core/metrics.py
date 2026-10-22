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
OVERDUE_STAGES = Gauge(
    "svod_overdue_stages",
    "Current number of overdue unfinished stages",
)
NOTIFICATION_SKIPPED = Counter(
    "svod_notification_skipped_total",
    "Notifications skipped because no recipient was available",
    ("type",),
)
