import api from '../lib/api';
import { getFormById, pagesPayloadToInstances, type FormResponse } from './forms.api';
import { parseRequestData } from '../utils/parseRequestData';
import type { FormFieldInstance, FormPageInstance } from '../types/form-builder.types';
import type { AuthorPreview } from '../../types/author';
import type {
  RequestExecutionEventDTO,
  RequestStageArtifactDTO,
  RequestStageDTO,
  RequestTimelineDTO,
  StageTechnicalSpecDTO,
} from '../../types/execution';
import type { AssignPerformerPayload, PerformerRecommendationResponse } from '../../types/performerSelection';
import type { RequestTechnicalSpecEnvelope } from '../../types/technicalSpec';
import type { AIRequestAnalysis, AIStagePlan, AIStagePlanItem, AISummary, RequestEntity, RequestPermissions, RequestPerson } from '../../types/request';
import type {
  RequestHistoryEventDTO,
  RequestTaskDTO,
  TaskPriority,
  TaskStatus,
  WorkflowStatus,
  WorkflowStatusSuggestion,
} from '../../types/requestWorkflow';
import type { Field, FieldOption, FormEntity } from '../../types/form';

export type RequestStatus = 'open' | 'closed' | 'assigned' | string;

export interface RequestResponse {
  id: string;
  title: string;
  form_id: string;
  organization_id: string | null;
  data: unknown;
  status: RequestStatus;
  deleted?: boolean;
  closedAt: string | null;
  created_by_user_id: string | null;
  author: AuthorPreview | null;
  created_at: string;
  updated_at: string;
  form_snapshot?: unknown | null;
  ai_summary?: AISummary | null;
  ai_analysis?: AIRequestAnalysis | null;
  source?: string | null;
  applicant_name?: string | null;
  applicant_company?: string | null;
  applicant_email?: string | null;
  applicant_phone?: string | null;
  people?: RequestPerson[];
  assigned_kind?: string | null;
  assigned_performer_id?: string | null;
  execution_status?: string | null;
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
  progress?: { completed: number; total: number };
  permissions?: RequestPermissions;
  ai_analysis_status?: string | null;
  ai_stage_plan?: AIStagePlan | null;
}

export interface GetRequestsFilters {
  archived?: boolean;
  mine?: boolean;
  workflow_status?: WorkflowStatus[];
  /** New requests nobody has taken into work yet */
  free?: boolean;
  /** Requests where the current user is responsible */
  mine_responsible?: boolean;
  /** Legacy filter, retained only while old clients are migrated. */
  status?: RequestStatus;
}

export interface RequestsCounts {
  open: number;
  in_progress: number;
  closed: number;
  archived: number;
}

export interface CreateRequestPayload {
  title: string;
  form_id: string;
  organization_id?: string | null;
  data: unknown;
  status?: RequestStatus;
  form_snapshot?: unknown;
}

export interface UpdateRequestPayload {
  title?: string;
  status?: RequestStatus;
  closedAt?: string | null;
  data?: unknown;
  priority?: string;
  due_date?: string | null;
}

export const getRequests = async (
  organizationId?: string | null,
  filters: GetRequestsFilters = {},
): Promise<RequestResponse[]> => {
  const params: Record<string, string | boolean> = {};
  if (organizationId) {
    params.organization_id = organizationId;
  }
  if (filters.archived !== undefined) {
    params.archived = filters.archived;
  }
  if (filters.mine) {
    params.mine = true;
  }
  if (filters.status) {
    params.status = filters.status;
  }
  if (filters.workflow_status?.length) {
    params.workflow_status = filters.workflow_status.join(',');
  }
  if (filters.free) {
    params.free = true;
  }
  if (filters.mine_responsible) {
    params.mine_responsible = true;
  }

  const { data } = await api.get<RequestResponse[]>('/requests', { params });
  return data;
};

export const getRequestsCounts = async (
  organizationId?: string | null,
): Promise<RequestsCounts> => {
  const params: Record<string, string> = {};
  if (organizationId) {
    params.organization_id = organizationId;
  }
  const { data } = await api.get<RequestsCounts>('/requests/counts', { params });
  return data;
};

export const getRequestById = async (id: string): Promise<RequestResponse> => {
  const { data } = await api.get<RequestResponse>(`/requests/${id}`);
  return data;
};

export const createRequest = async (
  payload: CreateRequestPayload,
): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>('/requests', {
    title: payload.title,
    form_id: payload.form_id,
    organization_id: payload.organization_id ?? null,
    data: payload.data,
    status: payload.status ?? 'open',
    form_snapshot: payload.form_snapshot ?? null,
  });
  return data;
};

export const updateRequest = async (
  id: string,
  payload: UpdateRequestPayload,
): Promise<RequestResponse> => {
  const body: Record<string, unknown> = {};

  if (payload.title !== undefined) body.title = payload.title;
  if (payload.status !== undefined) body.status = payload.status;
  if (payload.data !== undefined) body.data = payload.data;
  if (payload.closedAt !== undefined) body.closedAt = payload.closedAt;
  if (payload.priority !== undefined) body.priority = payload.priority;
  if (payload.due_date !== undefined) body.due_date = payload.due_date;

  const { data } = await api.put<RequestResponse>(`/requests/${id}`, body);
  return data;
};

export const closeRequest = async (id: string): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(`/requests/${id}/close`);
  return data;
};

export const deleteRequest = async (id: string): Promise<void> => {
  await api.delete(`/requests/${id}`);
};

export interface AIJobResponse {
  id: string;
  request_id: string;
  kind: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | string;
  error?: string | null;
  result?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export const generateRequestAnalysis = async (id: string): Promise<AIJobResponse> => {
  const { data } = await api.post<AIJobResponse>(`/requests/${id}/analysis`);
  return data;
};

export const getAIJob = async (jobId: string): Promise<AIJobResponse> => {
  const { data } = await api.get<AIJobResponse>(`/requests/ai-jobs/${jobId}`);
  return data;
};

export const getRequestPerformers = async (
  requestId: string,
): Promise<PerformerRecommendationResponse> => {
  const { data } = await api.get<PerformerRecommendationResponse>(
    `/requests/${requestId}/performers`,
  );
  return data;
};

export const getStagePerformers = async (
  requestId: string,
  stageId: string,
): Promise<PerformerRecommendationResponse> => {
  const { data } = await api.get<PerformerRecommendationResponse>(
    `/requests/${requestId}/stages/${stageId}/performers`,
  );
  return data;
};

export const assignRequestPerformer = async (
  requestId: string,
  payload: AssignPerformerPayload,
  options?: { stageId?: string },
): Promise<RequestResponse> => {
  const path =
    options?.stageId != null
      ? `/requests/${requestId}/stages/${options.stageId}/assign`
      : `/requests/${requestId}/assign`;
  const { data } = await api.post<RequestResponse>(path, payload);
  return data;
};

export interface AddStagePayload {
  title: string;
  description?: string | null;
  expected_result?: string | null;
  recommended_role?: string | null;
  due_date?: string | null;
  source?: string | null;
}

export interface PatchStagePayload {
  title?: string;
  description?: string | null;
  expected_result?: string | null;
  recommended_role?: string | null;
  due_date?: string | null;
}

export interface CompleteStagePayload {
  result_summary?: string | null;
  artifact_ids?: string[];
}

export interface BlockStagePayload {
  reason: string;
}

export const addRequestStage = async (
  requestId: string,
  payload: AddStagePayload,
): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(`/requests/${requestId}/stages`, payload);
  return data;
};

export const patchRequestStage = async (
  requestId: string,
  stageId: string,
  payload: PatchStagePayload,
): Promise<RequestResponse> => {
  const { data } = await api.patch<RequestResponse>(
    `/requests/${requestId}/stages/${stageId}`,
    payload,
  );
  return data;
};

export const completeRequestStage = async (
  requestId: string,
  stageId: string,
  payload?: CompleteStagePayload,
): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(
    `/requests/${requestId}/stages/${stageId}/complete`,
    payload ?? {},
  );
  return data;
};

export const blockRequestStage = async (
  requestId: string,
  stageId: string,
  payload: BlockStagePayload,
): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(
    `/requests/${requestId}/stages/${stageId}/block`,
    payload,
  );
  return data;
};

export const unblockRequestStage = async (
  requestId: string,
  stageId: string,
): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(
    `/requests/${requestId}/stages/${stageId}/unblock`,
    {},
  );
  return data;
};

export const getRequestTimeline = async (requestId: string): Promise<RequestTimelineDTO> => {
  const { data } = await api.get<RequestTimelineDTO>(`/requests/${requestId}/timeline`);
  return data;
};

export const generateStageSpecification = async (requestId: string, stageId: string) => {
  const { data } = await api.post(`/requests/${requestId}/stages/${stageId}/specification/generate`);
  return data;
};

export const createStageSpecification = async (
  requestId: string,
  stageId: string,
): Promise<StageTechnicalSpecDTO> => {
  const { data } = await api.post<StageTechnicalSpecDTO>(`/requests/${requestId}/stages/${stageId}/specification`);
  return data;
};

export const patchStageSpecification = async (
  requestId: string,
  stageId: string,
  specificationId: string,
  sections: Record<string, unknown>,
): Promise<StageTechnicalSpecDTO> => {
  const { data } = await api.patch<StageTechnicalSpecDTO>(
    `/requests/${requestId}/stages/${stageId}/specification/${specificationId}`,
    { sections },
  );
  return data;
};

export const confirmStageSpecification = async (
  requestId: string,
  stageId: string,
  specificationId: string,
): Promise<StageTechnicalSpecDTO> => {
  const { data } = await api.post<StageTechnicalSpecDTO>(
    `/requests/${requestId}/stages/${stageId}/specification/${specificationId}/confirm`,
  );
  return data;
};

export const assignRequestResponsible = async (
  requestId: string,
  responsibleUserId: string,
): Promise<RequestResponse> => {
  const { data } = await api.patch<RequestResponse>(`/requests/${requestId}/responsible`, {
    responsible_user_id: responsibleUserId,
  });
  return data;
};

export const takeRequest = async (requestId: string): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(`/requests/${requestId}/take`);
  return data;
};

export const releaseRequest = async (requestId: string, reason: string): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(`/requests/${requestId}/release`, { comment: reason });
  return data;
};

export const selfExecuteRequest = async (requestId: string): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(`/requests/${requestId}/self-execute`);
  return data;
};

export interface RequestAttributesPayload {
  priority?: string;
  due_date?: string | null;
}

export const updateRequestAttributes = async (
  requestId: string,
  payload: RequestAttributesPayload,
): Promise<RequestResponse> => {
  const { data } = await api.patch<RequestResponse>(`/requests/${requestId}/attributes`, payload);
  return data;
};

export const startRequest = async (requestId: string): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(`/requests/${requestId}/start`);
  return data;
};

export const cancelRequest = async (requestId: string, comment: string): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(`/requests/${requestId}/cancel`, { comment });
  return data;
};

export const requestMoreInformation = async (requestId: string, comment: string): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(`/requests/${requestId}/request-info`, { comment });
  return data;
};

export const reorderRequestStages = async (
  requestId: string,
  stageIds: string[],
): Promise<RequestResponse> => {
  const { data } = await api.put<RequestResponse>(`/requests/${requestId}/stages/order`, {
    stage_ids: stageIds,
  });
  return data;
};

export const deleteRequestStage = async (
  requestId: string,
  stageId: string,
): Promise<RequestResponse> => {
  const { data } = await api.delete<RequestResponse>(`/requests/${requestId}/stages/${stageId}`);
  return data;
};

export const uploadStageArtifact = async (
  requestId: string,
  stageId: string,
  file: File,
  purpose: 'input' | 'result' = 'input',
): Promise<RequestStageArtifactDTO> => {
  const body = new FormData();
  body.append('file', file);
  body.append('purpose', purpose);
  const { data } = await api.post<RequestStageArtifactDTO>(
    `/requests/${requestId}/stages/${stageId}/artifacts/files`,
    body,
  );
  return data;
};

export const addStageArtifactLink = async (
  requestId: string,
  stageId: string,
  payload: { name: string; url: string; purpose?: 'input' | 'result' },
): Promise<RequestStageArtifactDTO> => {
  const { data } = await api.post<RequestStageArtifactDTO>(
    `/requests/${requestId}/stages/${stageId}/artifacts/links`,
    payload,
  );
  return data;
};

export const deleteStageArtifact = async (
  requestId: string,
  stageId: string,
  artifactId: string,
): Promise<void> => {
  await api.delete(`/requests/${requestId}/stages/${stageId}/artifacts/${artifactId}`);
};

export const getStageArtifactDownloadUrl = async (
  requestId: string,
  stageId: string,
  artifactId: string,
): Promise<string> => {
  const { data } = await api.get<{ url: string }>(
    `/requests/${requestId}/stages/${stageId}/artifacts/${artifactId}/download-url`,
  );
  return data.url;
};

export const suggestRequestStagePlan = async (requestId: string): Promise<AIJobResponse> => {
  const { data } = await api.post<AIJobResponse>(`/requests/${requestId}/stage-plan/suggest`);
  return data;
};

export const applyRequestStagePlan = async (
  requestId: string,
  stages?: AIStagePlanItem[],
): Promise<RequestResponse> => {
  const { data } = await api.post<RequestResponse>(`/requests/${requestId}/stage-plan/apply`, {
    stages: stages ?? null,
  });
  return data;
};

export interface PatchWorkflowStatusPayload {
  status: WorkflowStatus;
  comment?: string | null;
  force_complete?: boolean;
}

export interface CreateRequestTaskPayload {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  assignee_id?: string | null;
  priority?: TaskPriority;
  due_date?: string | null;
  is_required?: boolean;
  order_index?: number;
}

export interface UpdateRequestTaskPayload {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  assignee_id?: string | null;
  priority?: TaskPriority;
  due_date?: string | null;
  is_required?: boolean;
  order_index?: number;
}

export const patchWorkflowStatus = async (
  requestId: string,
  payload: PatchWorkflowStatusPayload,
): Promise<RequestResponse> => {
  const { data } = await api.patch<RequestResponse>(
    `/requests/${requestId}/workflow-status`,
    payload,
  );
  return data;
};

export const getWorkflowSuggestion = async (
  requestId: string,
): Promise<WorkflowStatusSuggestion | null> => {
  const { data } = await api.get<WorkflowStatusSuggestion | null>(
    `/requests/${requestId}/workflow-suggestion`,
  );
  return data;
};

export const getRequestHistory = async (
  requestId: string,
): Promise<RequestHistoryEventDTO[]> => {
  const { data } = await api.get<RequestHistoryEventDTO[]>(
    `/requests/${requestId}/history`,
  );
  return data;
};

export const getRequestTasks = async (requestId: string): Promise<RequestTaskDTO[]> => {
  const { data } = await api.get<RequestTaskDTO[]>(`/requests/${requestId}/tasks`);
  return data;
};

export const createRequestTask = async (
  requestId: string,
  payload: CreateRequestTaskPayload,
): Promise<RequestTaskDTO> => {
  const { data } = await api.post<RequestTaskDTO>(`/requests/${requestId}/tasks`, payload);
  return data;
};

export const updateRequestTask = async (
  requestId: string,
  taskId: string,
  payload: UpdateRequestTaskPayload,
): Promise<RequestTaskDTO> => {
  const { data } = await api.patch<RequestTaskDTO>(
    `/requests/${requestId}/tasks/${taskId}`,
    payload,
  );
  return data;
};

export const patchRequestTaskStatus = async (
  requestId: string,
  taskId: string,
  status: TaskStatus,
): Promise<RequestTaskDTO> => {
  const { data } = await api.patch<RequestTaskDTO>(
    `/requests/${requestId}/tasks/${taskId}/status`,
    { status },
  );
  return data;
};

export const patchRequestTaskAssignee = async (
  requestId: string,
  taskId: string,
  assigneeId: string | null,
): Promise<RequestTaskDTO> => {
  const { data } = await api.patch<RequestTaskDTO>(
    `/requests/${requestId}/tasks/${taskId}/assignee`,
    { assignee_id: assigneeId },
  );
  return data;
};

export const cancelRequestTask = async (
  requestId: string,
  taskId: string,
): Promise<RequestTaskDTO> => {
  const { data } = await api.delete<RequestTaskDTO>(
    `/requests/${requestId}/tasks/${taskId}`,
  );
  return data;
};

const collectLeafFields = (pages: FormPageInstance[]): FormFieldInstance[] => {
  const result: FormFieldInstance[] = [];

  const walk = (fields: FormFieldInstance[]) => {
    for (const field of fields) {
      if (field.type === 'group' && field.children && field.children.length > 0) {
        walk(field.children);
      } else {
        result.push(field);
      }
    }
  };

  for (const page of pages) {
    walk(page.fields);
  }

  return result;
};

const mapForm = (row: FormResponse): FormEntity => {
  const pages = pagesPayloadToInstances(row.pages);
  const leafFields = collectLeafFields(pages);

  const fields: Field[] = leafFields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    options: f.options?.map<FieldOption>((opt) => ({ id: opt.id, label: opt.label })),
  }));

  return {
    id: row.id,
    title: row.name,
    fields,
    author: row.author,
  };
};

export interface RequestWithForm {
  request: RequestEntity;
  form: FormEntity;
  parsedData: Record<string, unknown>;
}

export async function getRequestWithForm(id: string): Promise<RequestWithForm> {
  try {
    const requestRow = await getRequestById(id);
    const parsedData = parseRequestData(requestRow.data);

    let form: FormEntity;
    let snapshot: FormEntity | null = null;

    if (requestRow.form_snapshot) {
      snapshot = requestRow.form_snapshot as FormEntity;
      form = snapshot;
    } else {
      const formRow = await getFormById(requestRow.form_id);
      form = mapForm(formRow);
    }

    const request: RequestEntity = {
      id: requestRow.id,
      title: requestRow.title,
      form_id: requestRow.form_id,
      organization_id: requestRow.organization_id ?? null,
      data: parsedData,
      status: requestRow.status,
      closedAt: requestRow.closedAt,
      created_by_user_id: requestRow.created_by_user_id,
      author: requestRow.author,
      created_at: requestRow.created_at,
      updated_at: requestRow.updated_at,
      form_snapshot: snapshot,
      ai_summary: requestRow.ai_summary ?? null,
      ai_analysis: requestRow.ai_analysis ?? null,
      people: requestRow.people ?? [],
      assigned_kind: requestRow.assigned_kind ?? null,
      assigned_performer_id: requestRow.assigned_performer_id ?? null,
      execution_status: requestRow.execution_status ?? null,
      stages: requestRow.stages ?? [],
      execution_events: requestRow.execution_events ?? [],
      workflow_status: requestRow.workflow_status ?? 'new',
      priority: requestRow.priority ?? 'medium',
      due_date: requestRow.due_date ?? null,
      responsible_user_id: requestRow.responsible_user_id ?? null,
      responsible_user: requestRow.responsible_user ?? null,
      tasks: requestRow.tasks ?? [],
      history: requestRow.history ?? [],
      ai_tz: requestRow.ai_tz ?? null,
      progress: requestRow.progress ?? { completed: 0, total: 0 },
      permissions: requestRow.permissions,
      ai_analysis_status: requestRow.ai_analysis_status ?? null,
      ai_stage_plan: requestRow.ai_stage_plan ?? null,
    };

    return { request, form, parsedData };
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Failed to load request details: ${err.message}`);
    }
    throw new Error('Failed to load request details');
  }
}
