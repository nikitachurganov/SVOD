import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Grid,
  Popconfirm,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useOrganization } from '../shared/context/organization.context';
import { useAuth } from '../shared/context/auth.context';
import { buildDisplayName } from '../shared/utils/userName';
import {
  getMembers,
  listOrgInvitations,
  removeMember,
  revokeInvitation,
} from '../shared/api/organizations.api';
import type { InvitationResponse, MemberResponse } from '../types/organization';
import { InviteMemberModal } from '../components/organization/InviteMemberModal';

const { Title } = Typography;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export const ParticipantsPage = () => {
  const { token } = theme.useToken();
  const { notification } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const contentPadding = isMobile
    ? token.paddingSM
    : screens.lg
      ? token.paddingLG
      : token.paddingMD;

  const { activeOrganization } = useOrganization();
  const { user } = useAuth();

  const isOwner =
    !!activeOrganization && activeOrganization.owner_user_id === user?.id;

  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [invitations, setInvitations] = useState<InvitationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('members');

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    setLoading(true);
    setError(null);
    try {
      const [membersData, invitationsData] = await Promise.all([
        getMembers(activeOrganization.id),
        isOwner ? listOrgInvitations(activeOrganization.id) : Promise.resolve([]),
      ]);
      setMembers(membersData);
      setInvitations(invitationsData.filter((i) => i.status === 'pending'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, [activeOrganization?.id, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      if (!activeOrganization) return;
      setRemovingId(userId);
      try {
        await removeMember(activeOrganization.id, userId);
        setMembers((prev) => prev.filter((m) => m.user.id !== userId));
        notification.success({ message: 'Участник исключён' });
      } catch {
        notification.error({ message: 'Не удалось исключить участника' });
      } finally {
        setRemovingId(null);
      }
    },
    [activeOrganization?.id, notification],
  );

  const handleRevokeInvitation = useCallback(
    async (invitationId: string) => {
      setRevokingId(invitationId);
      try {
        await revokeInvitation(invitationId);
        setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
        notification.success({ message: 'Приглашение отозвано' });
      } catch {
        notification.error({ message: 'Не удалось отозвать приглашение' });
      } finally {
        setRevokingId(null);
      }
    },
    [notification],
  );

  const memberColumns = useMemo<TableProps<MemberResponse>['columns']>(
    () => [
      {
        title: 'Участник',
        key: 'participant',
        minWidth: 220,
        render: (_, record) => (
          <div>
            <div>{buildDisplayName(record.user) || '—'}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {record.user.email}
            </Typography.Text>
          </div>
        ),
      },
      {
        title: 'Роль',
        key: 'role',
        width: 120,
        render: (_, record) => (
          <Tag color={record.role_tag === 'owner' ? 'gold' : 'blue'}>
            {record.role_tag === 'owner' ? 'Владелец' : 'Участник'}
          </Tag>
        ),
      },
      {
        title: 'Дата вступления',
        key: 'joined_at',
        width: 130,
        responsive: ['md'] as ('md')[],
        render: (_, record) => formatDate(record.joined_at),
      },
      ...(isOwner
        ? [
            {
              title: 'Действия',
              key: 'actions',
              width: 100,
              render: (_: unknown, record: MemberResponse) => {
                if (record.user.id === user?.id || record.role_tag === 'owner') return null;
                return (
                  <Popconfirm
                    title={`Исключить ${buildDisplayName(record.user)} из организации?`}
                    okText="Исключить"
                    cancelText="Отмена"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void handleRemoveMember(record.user.id)}
                  >
                    <Button
                      type="link"
                      size="small"
                      danger
                      loading={removingId === record.user.id}
                    >
                      Исключить
                    </Button>
                  </Popconfirm>
                );
              },
            },
          ]
        : []),
    ],
    [isOwner, handleRemoveMember, removingId, user?.id],
  );

  const invitationColumns = useMemo<TableProps<InvitationResponse>['columns']>(
    () => [
      {
        title: 'Email',
        dataIndex: 'email',
        key: 'email',
        minWidth: 220,
      },
      {
        title: 'Статус',
        key: 'status',
        width: 120,
        render: () => <Tag color="orange">Ожидает</Tag>,
      },
      {
        title: 'Дата отправки',
        key: 'created_at',
        width: 130,
        responsive: ['md'] as ('md')[],
        render: (_, record) => formatDate(record.created_at),
      },
      {
        title: 'Действия',
        key: 'actions',
        width: 100,
        render: (_, record) => (
          <Popconfirm
            title="Отозвать приглашение?"
            description="Приглашение будет аннулировано."
            okText="Отозвать"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={() => void handleRevokeInvitation(record.id)}
          >
            <Button
              type="link"
              size="small"
              danger
              loading={revokingId === record.id}
            >
              Отозвать
            </Button>
          </Popconfirm>
        ),
      },
    ],
    [handleRevokeInvitation, revokingId],
  );

  if (!activeOrganization) return null;

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* ── Header with integrated tabs ── */}
      <div
        style={{
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: token.marginSM,
            padding: `${token.paddingSM}px ${contentPadding}px ${token.padding}px`,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            Участники
          </Title>

          {isOwner && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setInviteOpen(true)}
              block={isMobile}
            >
              Пригласить участника
            </Button>
          )}
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="large"
          style={{ marginBottom: 0 }}
          tabBarStyle={{ paddingInline: contentPadding, marginBottom: 0 }}
          items={[
            { key: 'members', label: 'В организации' },
            ...(isOwner
              ? [{ key: 'invitations', label: 'Приглашения' }]
              : []),
          ]}
        />
      </div>

      {/* ── Content ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: contentPadding,
          background: token.colorBgLayout,
        }}
      >
        {error ? (
          <Alert
            type="error"
            showIcon
            message="Ошибка загрузки"
            description={error}
            action={
              <Button size="small" onClick={() => void load()}>
                Повторить
              </Button>
            }
          />
        ) : activeTab === 'members' ? (
          <Table<MemberResponse>
            rowKey="id"
            loading={loading}
            dataSource={members}
            columns={memberColumns}
            pagination={false}
            locale={{ emptyText: 'Нет участников' }}
          />
        ) : (
          <Table<InvitationResponse>
            rowKey="id"
            loading={loading}
            dataSource={invitations}
            columns={invitationColumns}
            pagination={false}
            locale={{ emptyText: 'Нет ожидающих приглашений' }}
          />
        )}
      </div>

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          void load();
        }}
        organizationId={activeOrganization.id}
      />
    </div>
  );
};
