import api from '../lib/api';
import type { AuthorPreview } from '../../types/author';
import type { RequestExecutionEventDTO, RequestStageDTO } from '../../types/execution';
import type { AssignPerformerPayload, PerformerRecommendationResponse } from '../../types/performerSelection';
import type { PatchRequestTZPayload, RequestTechnicalSpecEnvelope } from '../../types/technicalSpec';
import type { AIRequestAnalysis, AISummary, RequestPerson } from '../../types/request';

export type RequestStatus = 'open' | 'closed' | 'assigned' | string;

export interface RequestResponse {
  id: string;
  title: string;
  form_id: string;
  organization_id: string | null;
  data: unknown;
  status: RequestStatus;
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
  ai_tz?: RequestTechnicalSpecEnvelope | null;
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
}

export const getRequests = async (organizationId?: string | null): Promise<RequestResponse[]> => {
  const params = organizationId ? { organization_id: organizationId } : {};
  const { data } = await api.get<RequestResponse[]>('/requests', { params });
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

  const { data } = await api.put<RequestResponse>(`/requests/${id}`, body);
  return data;
};

export const closeRequest = async (id: string): Promise<RequestResponse> => {
  const { data } = await api.patch<RequestResponse>(`/requests/${id}/status`, {
    status: 'closed',
  });
  return data;
};

export const deleteRequest = async (id: string): Promise<void> => {
  await api.delete(`/requests/${id}`);
};

export const generateRequestAnalysis = async (id: string): Promise<AIRequestAnalysis> => {
  const { data } = await api.post<AIRequestAnalysis>(`/requests/${id}/analysis`);
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
  source?: string | null;
}

export interface PatchStagePayload {
  title?: string;
  description?: string | null;
}

export interface CompleteStagePayload {
  result_summary?: string | null;
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

export const generateRequestTZ = async (
  requestId: string,
): Promise<RequestTechnicalSpecEnvelope> => {
  const { data } = await api.post<RequestTechnicalSpecEnvelope>(
    `/requests/${requestId}/tz`,
  );
  return data;
};

export const patchRequestTZ = async (
  requestId: string,
  payload: PatchRequestTZPayload,
): Promise<RequestTechnicalSpecEnvelope> => {
  const { data } = await api.patch<RequestTechnicalSpecEnvelope>(
    `/requests/${requestId}/tz`,
    payload,
  );
  return data;
};
