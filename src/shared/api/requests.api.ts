import api from '../lib/api';
import type { AuthorPreview } from '../../types/author';

export type RequestStatus = 'open' | 'closed';

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
  ai_summary?: { summary: string; priority: string; tags: string[] } | null;
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
