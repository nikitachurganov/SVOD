"""Request workflow status, subtasks, and history event vocabulary."""

# Request workflow statuses
WF_DRAFT = "draft"
WF_NEW = "new"
WF_WAITING_INFO = "waiting_info"
WF_PLANNING = "planning"
WF_IN_PROGRESS = "in_progress"
WF_COMPLETED = "completed"
WF_CLOSED = "closed"
WF_CANCELLED = "cancelled"
WF_ARCHIVED = "archived"

WORKFLOW_STATUSES = frozenset(
    {
        WF_DRAFT,
        WF_NEW,
        WF_WAITING_INFO,
        WF_PLANNING,
        WF_IN_PROGRESS,
        WF_COMPLETED,
        WF_CLOSED,
        WF_CANCELLED,
        WF_ARCHIVED,
    }
)

WORKFLOW_TRANSITIONS: dict[str, frozenset[str]] = {
    WF_DRAFT: frozenset({WF_NEW}),
    WF_NEW: frozenset({WF_PLANNING, WF_WAITING_INFO, WF_CANCELLED}),
    WF_WAITING_INFO: frozenset({WF_NEW, WF_PLANNING, WF_CANCELLED}),
    WF_PLANNING: frozenset({WF_IN_PROGRESS, WF_WAITING_INFO, WF_CANCELLED}),
    WF_IN_PROGRESS: frozenset({WF_COMPLETED, WF_WAITING_INFO, WF_CANCELLED}),
    WF_COMPLETED: frozenset({WF_CLOSED, WF_PLANNING, WF_CANCELLED}),
    WF_CLOSED: frozenset({WF_ARCHIVED}),
    WF_CANCELLED: frozenset({WF_ARCHIVED}),
    WF_ARCHIVED: frozenset(),
}

ARCHIVABLE_STATUSES = frozenset({WF_CLOSED, WF_CANCELLED})

# Task statuses
TASK_TODO = "todo"
TASK_IN_PROGRESS = "in_progress"
TASK_BLOCKED = "blocked"
TASK_REVIEW = "review"
TASK_DONE = "done"
TASK_CANCELLED = "cancelled"

TASK_STATUSES = frozenset(
    {
        TASK_TODO,
        TASK_IN_PROGRESS,
        TASK_BLOCKED,
        TASK_REVIEW,
        TASK_DONE,
        TASK_CANCELLED,
    }
)

TASK_TERMINAL = frozenset({TASK_DONE, TASK_CANCELLED})
TASK_ACTIVE = frozenset({TASK_TODO, TASK_IN_PROGRESS, TASK_BLOCKED, TASK_REVIEW})

# Priorities
PRIORITY_LOW = "low"
PRIORITY_MEDIUM = "medium"
PRIORITY_HIGH = "high"
PRIORITY_URGENT = "urgent"

PRIORITIES = frozenset({PRIORITY_LOW, PRIORITY_MEDIUM, PRIORITY_HIGH, PRIORITY_URGENT})

# History event types
HISTORY_REQUEST_CREATED = "request_created"
HISTORY_REQUEST_UPDATED = "request_updated"
HISTORY_REQUEST_STATUS_CHANGED = "request_status_changed"
HISTORY_TASK_CREATED = "task_created"
HISTORY_TASK_UPDATED = "task_updated"
HISTORY_TASK_STATUS_CHANGED = "task_status_changed"
HISTORY_TASK_ASSIGNEE_CHANGED = "task_assignee_changed"
HISTORY_TASK_COMPLETED = "task_completed"
HISTORY_REQUEST_COMPLETED = "request_completed"
HISTORY_REQUEST_CANCELLED = "request_cancelled"

HISTORY_EVENT_TYPES = frozenset(
    {
        HISTORY_REQUEST_CREATED,
        HISTORY_REQUEST_UPDATED,
        HISTORY_REQUEST_STATUS_CHANGED,
        HISTORY_TASK_CREATED,
        HISTORY_TASK_UPDATED,
        HISTORY_TASK_STATUS_CHANGED,
        HISTORY_TASK_ASSIGNEE_CHANGED,
        HISTORY_TASK_COMPLETED,
        HISTORY_REQUEST_COMPLETED,
        HISTORY_REQUEST_CANCELLED,
    }
)

MANAGER_ROLE_TAGS = frozenset({"owner"})
