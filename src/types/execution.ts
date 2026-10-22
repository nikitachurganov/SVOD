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
  /** internal — organization member; external — contractor without an account */
  kind: string;
  full_name: string;
  email?: string | null;
  organization?: string | null;
  contact_kind?: string | null;
  contact_value?: string | null;
}

export interface RequestStageArtifactDTO {
  id: string;
  kind: 'file' | 'link' | string;
  purpose?: 'input' | 'result';
  name: string;
  url?: string | null;
  content_type?: string | null;
  size?: number | null;
  created_by_user_id?: string | null;
  created_at: string;
}

export interface RequestStageDTO {
  id: string;
  request_id: string;
  sequence: number;
  title: string;
  description?: string | null;
  expected_result?: string | null;
  recommended_role?: string | null;
  due_date?: string | null;
  is_overdue?: boolean;
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
  artifacts?: RequestStageArtifactDTO[];
}

export interface RequestExecutionEventDTO {
  id: string;
  request_id: string;
  stage_id?: string | null;
  event_type: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface StageTechnicalSpecDTO {
  id: string;
  version: number;
  status: 'draft' | 'confirmed';
  source: string;
  sections: Record<string, unknown>;
  generated_at: string;
  confirmed_at?: string | null;
}

export interface StageHandoffDTO {
  id: string;
  specification_id?: string | null;
  specification_version?: number | null;
  specification_snapshot?: Record<string, unknown> | null;
  assignee_kind: string;
  assignee_id?: string | null;
  assignee_name: string;
  assigned_by_name: string;
  due_date?: string | null;
  materials_snapshot: Array<Record<string, unknown>>;
  assigned_at: string;
}

export interface RequestTimelineStageDTO extends RequestStageDTO {
  specifications: StageTechnicalSpecDTO[];
  handoffs: StageHandoffDTO[];
  input_artifacts: RequestStageArtifactDTO[];
  result_artifacts: RequestStageArtifactDTO[];
  events: RequestExecutionEventDTO[];
}

export interface RequestTimelineDTO {
  request_id: string;
  stages: RequestTimelineStageDTO[];
  events: RequestExecutionEventDTO[];
  next_before?: string | null;
}
