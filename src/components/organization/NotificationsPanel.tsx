import { useEffect, useState } from 'react';
import { Button, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useOrganization } from '../../shared/hooks/organization.hooks';
import {
  acceptInvitation,
  declineInvitation,
  getMyInvitations,
} from '../../shared/api/organizations.api';
import type { MyInvitationResponse } from '../../types/organization';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type WorkflowNotification,
} from '../../shared/api/notifications.api';

function formatInvitationDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

interface Props {
  open: boolean;
  onAccepted: () => void;
  onInvitationsChanged: () => void;
  onNotificationsChanged: () => void;
}

export const NotificationsPanelContent = ({
  open,
  onAccepted,
  onInvitationsChanged,
  onNotificationsChanged,
}: Props) => {
  const navigate = useNavigate();
  const { setActiveOrganizationId, refreshOrganizations } = useOrganization();
  const [invitations, setInvitations] = useState<MyInvitationResponse[]>([]);
  const [notifications, setNotifications] = useState<WorkflowNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [invitationRows, notificationRows] = await Promise.all([
        getMyInvitations(),
        getNotifications(),
      ]);
      setInvitations(invitationRows);
      setNotifications(notificationRows.items);
      setUnreadCount(notificationRows.unread_count);
    } catch {
      // silently handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const handleAccept = async (id: string) => {
    setActionLoading(id);
    try {
      await acceptInvitation(id);
      setInvitations((prev) => prev.filter((i) => i.id !== id));
      onAccepted();
      onInvitationsChanged();
    } catch {
      // silently handled
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (id: string) => {
    setActionLoading(id);
    try {
      await declineInvitation(id);
      setInvitations((prev) => prev.filter((i) => i.id !== id));
      onInvitationsChanged();
    } catch {
      // silently handled
    } finally {
      setActionLoading(null);
    }
  };

  const handleNotification = async (item: WorkflowNotification) => {
    if (!item.read_at) {
      await markNotificationRead(item.id);
      setNotifications((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row,
        ),
      );
      setUnreadCount((value) => Math.max(0, value - 1));
      onNotificationsChanged();
    }
    if (item.type === 'join_request' && item.organization_id) {
      setActiveOrganizationId(item.organization_id);
      navigate('/participants');
      return;
    }
    if (item.type === 'join_request_approved' && item.organization_id) {
      await refreshOrganizations();
      setActiveOrganizationId(item.organization_id);
      navigate('/requests');
      return;
    }
    if (item.request_id) navigate(`/requests/${item.request_id}`);
  };

  const handleReadAll = async () => {
    await markAllNotificationsRead();
    const readAt = new Date().toISOString();
    setNotifications((prev) => prev.map((row) => ({ ...row, read_at: row.read_at ?? readAt })));
    setUnreadCount(0);
    onNotificationsChanged();
  };

  if (!open) return null;

  return (
    <div className="app-notifications-panel">
      <h2 className="app-notifications-panel__title">
        Уведомления
        {invitations.length + unreadCount > 0 ? ` (${invitations.length + unreadCount})` : ''}
        {unreadCount > 0 ? (
          <Button type="link" size="small" onClick={() => void handleReadAll()}>
            Прочитать все
          </Button>
        ) : null}
      </h2>
      {loading ? (
        <div className="app-notifications-panel__loading">
          <Spin size="small" />
        </div>
      ) : invitations.length === 0 && notifications.length === 0 ? (
        <p className="app-notifications-panel__empty">Нет уведомлений</p>
      ) : (
        <div className="app-notifications-panel__list">
          {invitations.map((inv) => {
            const inviterName = inv.invited_by
              ? `${inv.invited_by.first_name} ${inv.invited_by.last_name}`.trim()
              : 'Неизвестно';
            const busy = actionLoading === inv.id;
            const dateLabel = formatInvitationDate(inv.created_at);

            return (
              <div key={inv.id} className="app-notifications-panel__item">
                <div className="app-notifications-panel__org">{inv.organization_name}</div>
                <div className="app-notifications-panel__inviter">Пригласил: {inviterName}</div>
                <div className="app-notifications-panel__date">{dateLabel}</div>
                <div className="app-notifications-panel__actions">
                  <Button
                    type="primary"
                    size="small"
                    disabled={busy}
                    onClick={() => void handleAccept(inv.id)}
                  >
                    Принять
                  </Button>
                  <Button
                    danger
                    size="small"
                    disabled={busy}
                    onClick={() => void handleDecline(inv.id)}
                  >
                    Отклонить
                  </Button>
                </div>
              </div>
            );
          })}
          {notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`app-notifications-panel__item app-notifications-panel__workflow${
                item.read_at ? '' : ' app-notifications-panel__workflow--unread'
              }`}
              onClick={() => void handleNotification(item)}
            >
              <span className="app-notifications-panel__org">{item.title}</span>
              {item.body ? <span className="app-notifications-panel__inviter">{item.body}</span> : null}
              <span className="app-notifications-panel__date">{formatInvitationDate(item.created_at)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
