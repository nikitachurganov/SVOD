import type { AuthorPreview } from './author';

export type WorkflowStatus =
  | 'draft'
  | 'new'
  | 'triage'
  | 'waiting_info'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'cancelled'
  | 'archived';

export type TaskStatus =
  | 'todo'
  | 'in_progress'
  | 'blocked'
  | 'review'
  | 'done'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type HistoryEventType =
  | 'request_created'
  | 'request_updated'
  | 'request_status_changed'
  | 'task_created'
  | 'task_updated'
  | 'task_status_changed'
  | 'task_assignee_changed'
  | 'task_completed'
  | 'request_completed'
  | 'request_cancelled';

export interface RequestTaskAssigneePreview {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  email?: string | null;
}

export interface RequestTaskDTO {
  id: string;
  request_id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  assignee_id?: string | null;
  assignee?: RequestTaskAssigneePreview | null;
  created_by_id?: string | null;
  created_by?: AuthorPreview | null;
  priority: TaskPriority;
  due_date?: string | null;
  is_required: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface RequestHistoryActor {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  email?: string | null;
}

export interface RequestHistoryEventDTO {
  id: string;
  request_id: string;
  actor_id?: string | null;
  actor?: RequestHistoryActor | null;
  type: HistoryEventType | string;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface WorkflowStatusSuggestion {
  suggested_status: WorkflowStatus;
  reason: string;
}

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: 'Черновик',
  new: 'Новая',
  triage: 'На разборе',
  waiting_info: 'Ожидает информации',
  in_progress: 'В работе',
  review: 'На проверке',
  completed: 'Завершена',
  cancelled: 'Отменена',
  archived: 'В архиве',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  blocked: 'Заблокирована',
  review: 'На проверке',
  done: 'Выполнена',
  cancelled: 'Отменена',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  urgent: 'Срочный',
};

export const WORKFLOW_STATUS_COLORS: Record<WorkflowStatus, string> = {
  draft: 'default',
  new: 'blue',
  triage: 'cyan',
  waiting_info: 'orange',
  in_progress: 'processing',
  review: 'purple',
  completed: 'success',
  cancelled: 'error',
  archived: 'default',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'default',
  in_progress: 'processing',
  blocked: 'error',
  review: 'purple',
  done: 'success',
  cancelled: 'default',
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'default',
  medium: 'blue',
  high: 'orange',
  urgent: 'red',
};
