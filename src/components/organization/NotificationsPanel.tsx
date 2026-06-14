import { useEffect, useState } from 'react';
import { Button, Spin } from 'antd';
import {
  acceptInvitation,
  declineInvitation,
  getMyInvitations,
} from '../../shared/api/organizations.api';
import type { MyInvitationResponse } from '../../types/organization';

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
}

export const NotificationsPanelContent = ({
  open,
  onAccepted,
  onInvitationsChanged,
}: Props) => {
  const [invitations, setInvitations] = useState<MyInvitationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getMyInvitations();
      setInvitations(data);
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

  if (!open) return null;

  return (
    <div className="app-notifications-panel">
      <h2 className="app-notifications-panel__title">
        Уведомления
        {invitations.length > 0 ? ` (${invitations.length})` : ''}
      </h2>
      {loading ? (
        <div className="app-notifications-panel__loading">
          <Spin size="small" />
        </div>
      ) : invitations.length === 0 ? (
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
        </div>
      )}
    </div>
  );
};
