/** Request execution workflow (multi-stage). Align with backend schemas. */

export type ExecutionStatus =
  | 'new'
  | 'in_progress'
  | 'waiting'
  | 'blocked'
  | 'completed';

export type StageStatus =
  | 'pending'
  | 'waiting_assignment'
  | 'waiting_external'
  | 'in_progress'
  | 'needs_review'
  | 'blocked'
  | 'done'
  | 'cancelled';

export interface StageAssigneePreview {
  kind: string;
  full_name: string;
  email?: string | null;
}

export interface RequestStageDTO {
  id: string;
  request_id: string;
  sequence: number;
  title: string;
  description?: string | null;
  assignee_kind?: string | null;
  performer_id?: string | null;
  assignee_preview?: StageAssigneePreview | null;
  status: StageStatus | string;
  blocked_reason?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  completed_by_user_id?: string | null;
  result_summary?: string | null;
  source: string;
  template_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestExecutionEventDTO {
  id: string;
  request_id: string;
  stage_id?: string | null;
  event_type: string;
  actor_user_id?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
}
