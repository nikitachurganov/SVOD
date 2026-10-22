import type { FormEntity } from './form';
import type { AuthorPreview } from './author';
import type { ExecutionStatus, RequestExecutionEventDTO, RequestStageDTO } from './execution';
import type { RequestTechnicalSpecEnvelope } from './technicalSpec';
import type {
  RequestHistoryEventDTO,
  RequestTaskDTO,
  WorkflowStatus,
} from './requestWorkflow';

export interface AISummary {
  summary: string;
  priority: string;
  tags: string[];
}

export type AIAnalysisStatus = 'ready' | 'needs_clarification' | 'not_ready';

export type AIAnalysisIssueSeverity = 'low' | 'medium' | 'high';

export interface AIAnalysisIssue {
  type: string;
  severity: AIAnalysisIssueSeverity;
  field: string;
  message: string;
}

export interface AIRequestAnalysis {
  status: AIAnalysisStatus;
  completeness_score: number;
  ready_for_processing: boolean;
  issues: AIAnalysisIssue[];
  strengths: string[];
  recommendation: string;
}

export interface RequestPerson {
  role: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  source: string;
}

export interface RequestEntity {
  id: string;
  title: string;
  form_id: string;
  organization_id?: string | null;
  data: Record<string, unknown>;
  status: string;
  closedAt: string | null;
  created_by_user_id: string | null;
  author: AuthorPreview | null;
  created_at: string;
  updated_at: string;
  form_snapshot?: FormEntity | null;
  ai_summary?: AISummary | null;
  ai_analysis?: AIRequestAnalysis | null;
  people?: RequestPerson[];
  assigned_kind?: string | null;
  assigned_performer_id?: string | null;
  execution_status?: ExecutionStatus | string | null;
  stages?: RequestStageDTO[];
  execution_events?: RequestExecutionEventDTO[];
  workflow_status?: WorkflowStatus | string;
  priority?: string;
  due_date?: string | null;
  responsible_user_id?: string | null;
  responsible_user?: AuthorPreview | null;
  tasks?: RequestTaskDTO[];
  history?: RequestHistoryEventDTO[];
  ai_tz?: RequestTechnicalSpecEnvelope | null;
  source?: string | null;
  applicant_name?: string | null;
  applicant_company?: string | null;
  applicant_email?: string | null;
  applicant_phone?: string | null;
  progress?: { completed: number; total: number };
  permissions?: RequestPermissions;
  ai_analysis_status?: string | null;
  ai_stage_plan?: AIStagePlan | null;
}

export interface RequestPermissions {
  can_assign_responsible: boolean;
  can_manage_plan: boolean;
  can_start: boolean;
  can_close: boolean;
  can_cancel: boolean;
  can_delete: boolean;
  can_complete_active_stage: boolean;
  can_block_active_stage: boolean;
  can_unblock_active_stage: boolean;
  can_take?: boolean;
  can_release?: boolean;
  can_self_execute?: boolean;
  can_edit_attributes?: boolean;
}

export interface AIStagePlanItem {
  title: string;
  description?: string | null;
  expected_result?: string | null;
  role_hint?: string | null;
  estimated_duration_days?: number | null;
  technical_spec?: Record<string, unknown> | null;
  recommended_performers?: Array<Record<string, unknown>>;
}

export interface AIStagePlan {
  status: string;
  source_fingerprint: string;
  stages: AIStagePlanItem[];
  generated_at: string;
}
