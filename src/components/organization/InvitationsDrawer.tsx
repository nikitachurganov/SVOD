import { useEffect, useState } from 'react';
import { Modal, Button, Loading } from '@carbon/react';
import { Checkmark, Close } from '@carbon/react/icons';
import {
  acceptInvitation,
  declineInvitation,
  getMyInvitations,
} from '../../shared/api/organizations.api';
import type { MyInvitationResponse } from '../../types/organization';

interface Props {
  open: boolean;
  onClose: () => void;
  onAccepted: () => void;
}

export const InvitationsDrawer = ({ open, onClose, onAccepted }: Props) => {
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
    } catch {
      // silently handled
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading={`Приглашения${invitations.length > 0 ? ` (${invitations.length})` : ''}`}
      passiveModal
      onRequestClose={onClose}
      size="sm"
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Loading withOverlay={false} small />
        </div>
      ) : invitations.length === 0 ? (
        <p style={{ color: 'var(--cds-text-secondary)', textAlign: 'center', padding: 24 }}>
          Нет входящих приглашений
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {invitations.map((inv) => {
            const inviterName = inv.invited_by
              ? `${inv.invited_by.first_name} ${inv.invited_by.last_name}`
              : 'Неизвестно';
            const busy = actionLoading === inv.id;

            return (
              <div
                key={inv.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--cds-border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{inv.organization_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                    Пригласил: {inviterName}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    kind="primary"
                    size="sm"
                    renderIcon={Checkmark}
                    disabled={busy}
                    onClick={() => void handleAccept(inv.id)}
                  >
                    Принять
                  </Button>
                  <Button
                    kind="danger"
                    size="sm"
                    renderIcon={Close}
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
    </Modal>
  );
};
