import { useEffect, useState } from 'react';
import { Modal, Button, Loading, Tag } from '@carbon/react';
import { getMembers, removeMember } from '../../shared/api/organizations.api';
import type { MemberResponse } from '../../types/organization';

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  currentUserId: string;
}

export const MembersModal = ({
  open,
  onClose,
  organizationId,
  currentUserId,
}: Props) => {
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getMembers(organizationId);
      setMembers(data);
    } catch {
      // silently handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, organizationId]);

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    try {
      await removeMember(organizationId, userId);
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
    } catch {
      // silently handled
    } finally {
      setRemovingId(null);
      setConfirmRemove(null);
    }
  };

  return (
    <>
      <Modal
        open={open}
        modalHeading="Участники организации"
        passiveModal
        onRequestClose={onClose}
        size="md"
      >
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Loading withOverlay={false} small />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {members.map((member) => {
              const isCurrentUser = member.user.id === currentUserId;
              const isOwner = member.role_tag === 'owner';
              const name = `${member.user.first_name} ${member.user.last_name}`;
              const canRemove = !isOwner && !isCurrentUser;

              return (
                <div
                  key={member.user.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: '1px solid var(--cds-border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: 'var(--cds-layer-accent-01, #e0e0e0)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        {name}
                        {isCurrentUser && (
                          <Tag size="sm" style={{ marginLeft: 8 }}>Вы</Tag>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                        {member.user.email}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag type={isOwner ? 'warm-gray' : 'blue'} size="sm">
                      {isOwner ? 'Владелец' : 'Участник'}
                    </Tag>
                    {canRemove && (
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        disabled={removingId === member.user.id}
                        onClick={() => setConfirmRemove({ userId: member.user.id, name })}
                      >
                        Удалить
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {confirmRemove && (
        <Modal
          open
          danger
          modalHeading={`Удалить ${confirmRemove.name} из организации?`}
          primaryButtonText="Удалить"
          secondaryButtonText="Отмена"
          onRequestClose={() => setConfirmRemove(null)}
          onRequestSubmit={() => void handleRemove(confirmRemove.userId)}
          size="xs"
        />
      )}
    </>
  );
};
