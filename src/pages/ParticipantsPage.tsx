import { useCallback, useEffect, useMemo, useState } from 'react';
import { Table, Button, Tag, Modal, Alert, Card } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useAuth } from '../shared/hooks/auth.hooks';
import { buildDisplayName } from '../shared/utils/userName';
import {
  getMembers,
  listOrgInvitations,
  removeMember,
  revokeInvitation,
} from '../shared/api/organizations.api';
import type { InvitationResponse, MemberResponse } from '../types/organization';
import { InviteMemberModal } from '../components/organization/InviteMemberModal';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type MemberRow = {
  id: string;
  participant: string;
  email: string;
  role: string;
  joined_at: string;
};

type InviteRow = {
  id: string;
  email: string;
  status: string;
  created_at: string;
};

type ParticipantsTabKey = 'members' | 'invitations';

const TAB_ORDER: ParticipantsTabKey[] = ['members', 'invitations'];

const TAB_LABELS: Record<ParticipantsTabKey, string> = {
  members: 'В организации',
  invitations: 'Приглашения',
};

export const ParticipantsPage = () => {
  const { activeOrganization } = useOrganization();
  const { user } = useAuth();
  const isOwner = !!activeOrganization && activeOrganization.owner_user_id === user?.id;

  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [invitations, setInvitations] = useState<InvitationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ParticipantsTabKey>('members');
  const [confirmAction, setConfirmAction] = useState<{ type: 'remove' | 'revoke'; id: string; name: string } | null>(null);

  const activeOrganizationId = activeOrganization?.id;
  const visibleTabs = isOwner ? TAB_ORDER : (['members'] as ParticipantsTabKey[]);

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true); setError(null);
    try {
      const [m, inv] = await Promise.all([
        getMembers(activeOrganizationId),
        isOwner ? listOrgInvitations(activeOrganizationId) : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvitations(inv.filter((i) => i.status === 'pending'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
    } finally { setLoading(false); }
  }, [activeOrganizationId, isOwner]);

  useEffect(() => { void load(); }, [load]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!activeOrganizationId) return;
    setRemovingId(userId);
    try {
      await removeMember(activeOrganizationId, userId);
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
    } catch { /* handled */ } finally { setRemovingId(null); setConfirmAction(null); }
  }, [activeOrganizationId]);

  const handleRevokeInvitation = useCallback(async (invId: string) => {
    setRevokingId(invId);
    try {
      await revokeInvitation(invId);
      setInvitations((prev) => prev.filter((i) => i.id !== invId));
    } catch { /* handled */ } finally { setRevokingId(null); setConfirmAction(null); }
  }, []);

  const memberRows = useMemo<MemberRow[]>(() => members.map((m) => ({
    id: m.user.id,
    participant: buildDisplayName(m.user) || '—',
    email: m.user.email,
    role: m.role_tag,
    joined_at: m.joined_at,
  })), [members]);

  const inviteRows = useMemo<InviteRow[]>(() => invitations.map((i) => ({
    id: i.id,
    email: i.email,
    status: 'pending',
    created_at: i.created_at,
  })), [invitations]);

  const memberColumns = useMemo<ColumnsType<MemberRow>>(
    () => [
      {
        title: 'Участник',
        dataIndex: 'participant',
        key: 'participant',
        sorter: (a, b) => a.participant.localeCompare(b.participant, 'ru'),
        render: (name: string, record) => (
          <div>
            <div>{name}</div>
            <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>{record.email}</div>
          </div>
        ),
      },
      {
        title: 'Роль',
        dataIndex: 'role',
        key: 'role',
        sorter: (a, b) => a.role.localeCompare(b.role, 'ru'),
        render: (role: string) => (
          <Tag color={role === 'owner' ? 'default' : 'blue'}>
            {role === 'owner' ? 'Владелец' : 'Участник'}
          </Tag>
        ),
      },
      {
        title: 'Дата вступления',
        dataIndex: 'joined_at',
        key: 'joined_at',
        sorter: (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Действия',
        key: 'actions',
        render: (_, record) => {
          const member = members.find((m) => m.user.id === record.id);
          if (!isOwner || record.id === user?.id || member?.role_tag === 'owner') return null;
          return (
            <Button
              type="text"
              size="small"
              danger
              disabled={removingId === record.id}
              onClick={() => setConfirmAction({
                type: 'remove',
                id: record.id,
                name: buildDisplayName(member!.user),
              })}
            >
              Исключить
            </Button>
          );
        },
      },
    ],
    [isOwner, members, removingId, user?.id],
  );

  const inviteColumns = useMemo<ColumnsType<InviteRow>>(
    () => [
      {
        title: 'Email',
        dataIndex: 'email',
        key: 'email',
        sorter: (a, b) => a.email.localeCompare(b.email, 'ru'),
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        render: () => <Tag color="default">Ожидает</Tag>,
      },
      {
        title: 'Дата отправки',
        dataIndex: 'created_at',
        key: 'created_at',
        sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Действия',
        key: 'actions',
        render: (_, record) => (
          <Button
            type="text"
            size="small"
            danger
            disabled={revokingId === record.id}
            onClick={() => setConfirmAction({
              type: 'revoke',
              id: record.id,
              name: record.email,
            })}
          >
            Отозвать
          </Button>
        ),
      },
    ],
    [revokingId],
  );

  if (!activeOrganization) return null;

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <div className="registry-page__title-row">
          <h1 className="registry-page__title">Участники</h1>
          {isOwner ? (
            <Button
              type="primary"
              className="registry-page__create-btn"
              icon={<PlusOutlined />}
              onClick={() => setInviteOpen(true)}
            >
              Пригласить
            </Button>
          ) : null}
        </div>
        {visibleTabs.length > 1 ? (
          <div className="registry-page__tabs" role="tablist" aria-label="Разделы участников">
            {visibleTabs.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                className={`registry-page__tab${activeTab === key ? ' registry-page__tab--active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {TAB_LABELS[key]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="registry-page__content">
        {error ? (
          <Card className="registry-page__card">
            <Alert type="error" title="Ошибка загрузки" description={error} showIcon />
            <Button type="text" size="small" onClick={() => void load()} style={{ marginTop: 8 }}>
              Повторить
            </Button>
          </Card>
        ) : (
          <Card className="registry-page__card">
            {activeTab === 'members' ? (
              <Table<MemberRow>
                rowKey="id"
                columns={memberColumns}
                dataSource={memberRows}
                loading={loading}
                locale={{ emptyText: 'Нет участников' }}
                pagination={false}
                size="middle"
              />
            ) : (
              <Table<InviteRow>
                rowKey="id"
                columns={inviteColumns}
                dataSource={inviteRows}
                loading={loading}
                locale={{ emptyText: 'Нет ожидающих приглашений' }}
                pagination={false}
                size="middle"
              />
            )}
          </Card>
        )}
      </div>

      <InviteMemberModal open={inviteOpen} onClose={() => { setInviteOpen(false); void load(); }} organizationId={activeOrganization.id} />

      <Modal
        open={!!confirmAction}
        title={
          confirmAction?.type === 'remove'
            ? `Исключить ${confirmAction.name}?`
            : 'Отозвать приглашение?'
        }
        okText={confirmAction?.type === 'remove' ? 'Исключить' : 'Отозвать'}
        cancelText="Отмена"
        okButtonProps={{ danger: true }}
        onCancel={() => setConfirmAction(null)}
        onOk={() => {
          if (!confirmAction) return;
          void (confirmAction.type === 'remove'
            ? handleRemoveMember(confirmAction.id)
            : handleRevokeInvitation(confirmAction.id));
        }}
      />
    </div>
  );
};
