import api from '../lib/api';
import { getFormById, pagesPayloadToInstances, type FormResponse } from './forms.api';
import { parseRequestData } from '../utils/parseRequestData';
import type { FormFieldInstance, FormPageInstance } from '../types/form-builder.types';
import type { AuthorPreview } from '../../types/author';
import type { RequestExecutionEventDTO, RequestStageDTO } from '../../types/execution';
import type { AssignPerformerPayload, PerformerRecommendationResponse } from '../../types/performerSelection';
import type { PatchRequestTZPayload, RequestTechnicalSpecEnvelope } from '../../types/technicalSpec';
import type { AIRequestAnalysis, AISummary, RequestEntity, RequestPerson } from '../../types/request';
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
  ai_tz?: RequestTechnicalSpecEnvelope | null;
}

export interface GetRequestsFilters {
  archived?: boolean;
  mine?: boolean;
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
      ai_tz: requestRow.ai_tz ?? null,
    };

    return { request, form, parsedData };
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Failed to load request details: ${err.message}`);
    }
    throw new Error('Failed to load request details');
  }
}
