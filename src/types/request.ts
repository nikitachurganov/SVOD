import type { FormEntity } from './form';
import type { AuthorPreview } from './author';
import type { ExecutionStatus, RequestExecutionEventDTO, RequestStageDTO } from './execution';
import type { RequestTechnicalSpecEnvelope } from './technicalSpec';

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
  ai_tz?: RequestTechnicalSpecEnvelope | null;
}
