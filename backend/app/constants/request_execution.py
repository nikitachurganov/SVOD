"""Request execution workflow (RequestStage) — vocabulary and MVP policy.

Sequential-only MVP: one active stage at a time (first non-terminal by sequence).

Permissions (MVP): any organization member who can access the request may manage
execution (same plane as assign). Future: coordinator vs assignee split
(`can_manage_execution`, complete own stage only).
"""

# Stage lifecycle
STAGE_PENDING = "pending"
STAGE_WAITING_ASSIGNMENT = "waiting_assignment"
STAGE_WAITING_EXTERNAL = "waiting_external"
STAGE_IN_PROGRESS = "in_progress"
STAGE_NEEDS_REVIEW = "needs_review"
STAGE_BLOCKED = "blocked"
STAGE_DONE = "done"
STAGE_CANCELLED = "cancelled"

STAGE_STATUSES = frozenset(
    {
        STAGE_PENDING,
        STAGE_WAITING_ASSIGNMENT,
        STAGE_WAITING_EXTERNAL,
        STAGE_IN_PROGRESS,
        STAGE_NEEDS_REVIEW,
        STAGE_BLOCKED,
        STAGE_DONE,
        STAGE_CANCELLED,
    }
)

STAGE_TERMINAL = frozenset({STAGE_DONE, STAGE_CANCELLED})

# Derived request.execution_status (persisted cache, aligned with design doc)
EXEC_NEW = "new"
EXEC_IN_PROGRESS = "in_progress"
EXEC_WAITING = "waiting"
EXEC_BLOCKED = "blocked"
EXEC_COMPLETED = "completed"

EXEC_STATUSES = frozenset(
    {EXEC_NEW, EXEC_IN_PROGRESS, EXEC_WAITING, EXEC_BLOCKED, EXEC_COMPLETED}
)

# Legacy requests.status mapping (backward compatible)
LEGACY_OPEN = "open"
LEGACY_ASSIGNED = "assigned"
LEGACY_CLOSED = "closed"

STAGE_SOURCE_MANUAL = "manual"
STAGE_SOURCE_TEMPLATE = "template"
STAGE_SOURCE_AI = "ai"
STAGE_SOURCE_IMPORT = "import"

STAGE_SOURCES = frozenset(
    {STAGE_SOURCE_MANUAL, STAGE_SOURCE_TEMPLATE, STAGE_SOURCE_AI, STAGE_SOURCE_IMPORT}
)

EVENT_ASSIGN = "assign"
EVENT_REASSIGN = "reassign"
EVENT_COMPLETE = "complete"
EVENT_BLOCK = "block"
EVENT_UNBLOCK = "unblock"
EVENT_STAGE_ADDED = "stage_added"
EVENT_STAGE_UPDATED = "stage_updated"
EVENT_SKIP = "skip"

DEFAULT_STAGE_TITLE = "Исполнение"
