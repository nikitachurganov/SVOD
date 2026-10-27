import api from '../lib/api';
import type {
  AdminGrantPayload,
  AdminPlanRequest,
  AdminStats,
  AdminUserDetail,
  AdminUserPatch,
  AdminUserRow,
  AdminUsersQuery,
  Paged,
  PlanRequestStatus,
} from '../../types/admin';

export const listAdminUsers = async (query: AdminUsersQuery): Promise<Paged<AdminUserRow>> => {
  const params: Record<string, string | number | boolean> = {
    sort: query.sort,
    direction: query.direction,
    page: query.page,
    page_size: query.page_size,
  };
  if (query.q) params.q = query.q;
  if (query.tier) params.tier = query.tier;
  if (query.email_verified !== undefined) params.email_verified = query.email_verified;
  if (query.is_active !== undefined) params.is_active = query.is_active;
  const { data } = await api.get<Paged<AdminUserRow>>('/admin/users', { params });
  return data;
};

export const getAdminUser = async (userId: string): Promise<AdminUserDetail> => {
  const { data } = await api.get<AdminUserDetail>(`/admin/users/${userId}`);
  return data;
};

export const patchAdminUser = async (
  userId: string,
  patch: AdminUserPatch,
): Promise<AdminUserDetail> => {
  const { data } = await api.patch<AdminUserDetail>(`/admin/users/${userId}`, patch);
  return data;
};

export const grantAdminPlan = async (
  userId: string,
  payload: AdminGrantPayload,
): Promise<AdminUserDetail> => {
  const { data } = await api.post<AdminUserDetail>(`/admin/users/${userId}/subscription`, payload);
  return data;
};

export const revokeAdminPlan = async (userId: string): Promise<AdminUserDetail> => {
  const { data } = await api.delete<AdminUserDetail>(`/admin/users/${userId}/subscription`);
  return data;
};

export const listPlanRequests = async (query: {
  status?: PlanRequestStatus;
  page: number;
  page_size: number;
}): Promise<Paged<AdminPlanRequest>> => {
  const { data } = await api.get<Paged<AdminPlanRequest>>('/admin/plan-requests', {
    params: query,
  });
  return data;
};

export const approvePlanRequest = async (
  requestId: string,
  body: { days?: number; note?: string },
): Promise<AdminPlanRequest> => {
  const { data } = await api.post<AdminPlanRequest>(
    `/admin/plan-requests/${requestId}/approve`,
    body,
  );
  return data;
};

export const rejectPlanRequest = async (
  requestId: string,
  body: { reason?: string },
): Promise<AdminPlanRequest> => {
  const { data } = await api.post<AdminPlanRequest>(
    `/admin/plan-requests/${requestId}/reject`,
    body,
  );
  return data;
};

export const getAdminStats = async (): Promise<AdminStats> => {
  const { data } = await api.get<AdminStats>('/admin/stats');
  return data;
};

/** The server explains its refusals in Russian in `detail.message`; otherwise the fallback is shown */
export const adminErrorText = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') {
    const { message, code } = detail as { message?: unknown; code?: unknown };
    if (typeof message === 'string') return message;
    if (code === 'plan_request_processed') return 'Эта заявка уже обработана.';
    if (code === 'cannot_block_self') return 'Нельзя заблокировать себя.';
    if (code === 'last_admin') return 'Нельзя заблокировать последнего администратора.';
  }
  return fallback;
};
