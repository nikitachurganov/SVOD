import api from '../lib/api';

export type WorkflowNotification = {
  id: string;
  organization_id?: string | null;
  request_id?: string | null;
  stage_id?: string | null;
  type: string;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at: string;
};

export type NotificationListResponse = {
  items: WorkflowNotification[];
  unread_count: number;
};

export async function getNotifications(limit = 50): Promise<NotificationListResponse> {
  const { data } = await api.get<NotificationListResponse>('/notifications', { params: { limit } });
  return data;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await api.patch(`/notifications/${notificationId}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/notifications/read-all');
}
