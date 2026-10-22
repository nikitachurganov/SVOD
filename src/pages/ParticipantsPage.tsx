import { useCallback, useEffect, useMemo, useState } from 'react';
import { Table, Button, Tag, Modal, Alert, Card, Tooltip, Dropdown, Badge, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  SendOutlined,
  SolutionOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useAuth } from '../shared/hooks/auth.hooks';
import { buildDisplayName } from '../shared/utils/userName';
import {
  deleteExternalContractor,
  getMembers,
  listExternalContractors,
  listJoinRequests,
  listOrgInvitations,
  removeMember,
  resendInvitation,
  revokeInvitation,
} from '../shared/api/organizations.api';
import type {
  ExternalContractor,
  InvitationResponse,
  JoinRequestResponse,
  MemberResponse,
} from '../types/organization';
import { InviteMemberModal, InvitationResult } from '../components/organization/InviteMemberModal';
import { ContractorModal } from '../components/organization/ContractorModal';
import { JoinLinkModal } from '../components/organization/JoinLinkModal';
import { JoinRequestsTable } from '../components/organization/JoinRequestsTable';
import { CONTACT_KIND_LABELS, copyToClipboard } from '../components/organization/participants.utils';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const apiErrorText = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
};

type MemberRow = {
  id: string;
  participant: string;
  email: string;
  role: string;
  job_title: string | null;
  joined_at: string;
};

type ParticipantsTabKey = 'members' | 'contractors' | 'requests' | 'invitations';

const TAB_LABELS: Record<ParticipantsTabKey, string> = {
  members: 'В организации',
  contractors: 'Подрядчики',
  requests: 'Заявки на вступление',
  invitations: 'Приглашения',
};

type ConfirmAction =
  | { type: 'remove'; id: string; name: string }
  | { type: 'revoke'; id: string; name: string }
  | { type: 'delete-contractor'; id: string; name: string };

const isExpired = (inv: InvitationResponse): boolean =>
  Boolean(inv.expires_at && new Date(inv.expires_at).getTime() < Date.now());

export const ParticipantsPage = () => {
  const { activeOrganization } = useOrganization();
  const { user } = useAuth();
  const isOwner = !!activeOrganization && activeOrganization.owner_user_id === user?.id;

  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [invitations, setInvitations] = useState<InvitationResponse[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequestResponse[]>([]);
  const [joinLinkOpen, setJoinLinkOpen] = useState(false);
  const [contractors, setContractors] = useState<ExternalContractor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resendResult, setResendResult] = useState<InvitationResponse | null>(null);
  const [contractorModal, setContractorModal] = useState<{ open: boolean; contractor: ExternalContractor | null }>({
    open: false,
    contractor: null,
  });
  const [activeTab, setActiveTab] = useState<ParticipantsTabKey>('members');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const activeOrganizationId = activeOrganization?.id;
  const visibleTabs: ParticipantsTabKey[] = isOwner
    ? ['members', 'contractors', 'requests', 'invitations']
    : ['members', 'contractors'];

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true); setError(null);
    try {
      const [m, c, inv, jr] = await Promise.all([
        getMembers(activeOrganizationId),
        listExternalContractors(activeOrganizationId),
        isOwner ? listOrgInvitations(activeOrganizationId) : Promise.resolve([]),
        isOwner ? listJoinRequests(activeOrganizationId) : Promise.resolve([]),
      ]);
      setMembers(m);
      setContractors(c);
      setInvitations(inv.filter((i) => i.status === 'pending'));
      setJoinRequests(jr);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
    } finally { setLoading(false); }
  }, [activeOrganizationId, isOwner]);

  useEffect(() => { void load(); }, [load]);

  const handleConfirm = useCallback(async () => {
    if (!confirmAction || !activeOrganizationId) return;
    setBusyId(confirmAction.id);
    try {
      if (confirmAction.type === 'remove') {
        await removeMember(activeOrganizationId, confirmAction.id);
        setMembers((prev) => prev.filter((m) => m.user.id !== confirmAction.id));
      } else if (confirmAction.type === 'revoke') {
        await revokeInvitation(confirmAction.id);
        setInvitations((prev) => prev.filter((i) => i.id !== confirmAction.id));
      } else {
        await deleteExternalContractor(activeOrganizationId, confirmAction.id);
        setContractors((prev) => prev.filter((c) => c.id !== confirmAction.id));
      }
      setConfirmAction(null);
    } catch (err) {
      message.error(apiErrorText(err, 'Не удалось выполнить действие'));
    } finally { setBusyId(null); }
  }, [activeOrganizationId, confirmAction]);

  const handleResend = useCallback(async (invitationId: string) => {
    setBusyId(invitationId);
    try {
      const updated = await resendInvitation(invitationId);
      setInvitations((prev) => prev.map((i) => (i.id === invitationId ? updated : i)));
      setResendResult(updated);
    } catch (err) {
      message.error(apiErrorText(err, 'Не удалось отправить приглашение повторно'));
    } finally { setBusyId(null); }
  }, []);

  const memberRows = useMemo<MemberRow[]>(() => members.map((m) => ({
    id: m.user.id,
    participant: buildDisplayName(m.user) || '—',
    email: m.user.email,
    role: m.role_tag,
    job_title: m.job_title ?? null,
    joined_at: m.joined_at,
  })), [members]);

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
        title: 'Должность',
        dataIndex: 'job_title',
        key: 'job_title',
        render: (value: string | null) => value ?? <span style={{ color: 'var(--app-text-secondary)' }}>—</span>,
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
          if (!isOwner || record.id === user?.id || record.role === 'owner') return null;
          return (
            <Button
              type="text"
              size="small"
              danger
              disabled={busyId === record.id}
              onClick={() => setConfirmAction({ type: 'remove', id: record.id, name: record.participant })}
            >
              Исключить
            </Button>
          );
        },
      },
    ],
    [busyId, isOwner, user?.id],
  );

  const contractorColumns = useMemo<ColumnsType<ExternalContractor>>(
    () => [
      {
        title: 'Подрядчик',
        dataIndex: 'full_name',
        key: 'full_name',
        sorter: (a, b) => a.full_name.localeCompare(b.full_name, 'ru'),
        render: (name: string, record) => (
          <div>
            <div>{name}</div>
            {record.organization || record.position ? (
              <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                {[record.position, record.organization].filter(Boolean).join(' · ')}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        title: 'Сфера деятельности',
        dataIndex: 'specialization',
        key: 'specialization',
        render: (value: string | null, record) => (
          <div>
            <div>{value ?? <span style={{ color: 'var(--app-text-secondary)' }}>—</span>}</div>
            {record.geography ? (
              <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>{record.geography}</div>
            ) : null}
          </div>
        ),
      },
      {
        title: 'Контакт',
        key: 'contact',
        render: (_, record) =>
          record.contact_value ? (
            <div>
              <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                {CONTACT_KIND_LABELS[record.contact_kind ?? ''] ?? 'Контакт'}
              </div>
              <div>{record.contact_value}</div>
            </div>
          ) : (
            <span style={{ color: 'var(--app-text-secondary)' }}>—</span>
          ),
      },
      ...(isOwner
        ? [
            {
              title: 'Действия',
              key: 'actions',
              width: 100,
              render: (_: unknown, record: ExternalContractor) => (
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    aria-label="Редактировать подрядчика"
                    onClick={() => setContractorModal({ open: true, contractor: record })}
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label="Удалить подрядчика"
                    disabled={busyId === record.id}
                    onClick={() => setConfirmAction({ type: 'delete-contractor', id: record.id, name: record.full_name })}
                  />
                </div>
              ),
            },
          ]
        : []),
    ],
    [busyId, isOwner],
  );

  const inviteColumns = useMemo<ColumnsType<InvitationResponse>>(
    () => [
      {
        title: 'Кого пригласили',
        dataIndex: 'email',
        key: 'email',
        sorter: (a, b) => a.email.localeCompare(b.email, 'ru'),
        render: (email: string, record) => (
          <div>
            <div>{record.invited_user ? buildDisplayName(record.invited_user) : email}</div>
            <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
              {[email, record.job_title].filter(Boolean).join(' · ')}
            </div>
          </div>
        ),
      },
      {
        title: 'Статус',
        key: 'status',
        render: (_, record) =>
          isExpired(record) ? (
            <Tag color="error">Ссылка истекла</Tag>
          ) : record.kind === 'new_account' ? (
            <Tag color="gold">Ждём активации аккаунта</Tag>
          ) : (
            <Tag>Ждём ответа</Tag>
          ),
      },
      {
        title: 'Отправлено',
        dataIndex: 'created_at',
        key: 'created_at',
        sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        render: (value: string, record) => (
          <div>
            <div>{formatDate(value)}</div>
            {record.expires_at ? (
              <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                до {formatDate(record.expires_at)}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        title: 'Действия',
        key: 'actions',
        render: (_, record) => (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {record.activation_url && !isExpired(record) ? (
              <Tooltip title="Скопировать ссылку для активации">
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  aria-label="Скопировать ссылку для активации"
                  onClick={async () => {
                    const ok = await copyToClipboard(record.activation_url ?? '');
                    if (ok) message.success('Ссылка скопирована');
                    else message.error('Не удалось скопировать ссылку');
                  }}
                />
              </Tooltip>
            ) : null}
            <Button
              type="text"
              size="small"
              icon={<SendOutlined />}
              loading={busyId === record.id}
              onClick={() => void handleResend(record.id)}
            >
              Повторить
            </Button>
            <Button
              type="text"
              size="small"
              danger
              disabled={busyId === record.id}
              onClick={() => setConfirmAction({ type: 'revoke', id: record.id, name: record.email })}
            >
              Отозвать
            </Button>
          </div>
        ),
      },
    ],
    [busyId, handleResend],
  );

  if (!activeOrganization) return null;

  const headerAction = isOwner ? (
    <Dropdown
      classNames={{ root: 'app-menu-dropdown' }}
      trigger={['click']}
      menu={{
        items: [
          {
            key: 'link',
            icon: <LinkOutlined />,
            label: 'Пригласить по ссылке',
            extra: 'с модерацией',
          },
          { key: 'manual', icon: <UserAddOutlined />, label: 'Добавить вручную', extra: 'аккаунт + письмо' },
          { type: 'divider' },
          { key: 'contractor', icon: <SolutionOutlined />, label: 'Добавить подрядчика', extra: 'без входа' },
        ],
        onClick: ({ key }) => {
          if (key === 'link') setJoinLinkOpen(true);
          else if (key === 'manual') setInviteOpen(true);
          else setContractorModal({ open: true, contractor: null });
        },
      }}
    >
      <Button type="primary" className="registry-page__create-btn" icon={<PlusOutlined />}>
        Добавить <DownOutlined style={{ fontSize: 10 }} />
      </Button>
    </Dropdown>
  ) : null;

  const confirmTitle =
    confirmAction?.type === 'remove'
      ? `Исключить ${confirmAction.name}?`
      : confirmAction?.type === 'delete-contractor'
        ? `Удалить подрядчика ${confirmAction.name}?`
        : 'Отозвать приглашение?';

  return (
    <div className="registry-page">
      <div className="registry-page__header">
        <div className="registry-page__title-row">
          <h1 className="registry-page__title">Участники</h1>
          {headerAction}
        </div>
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
              {key === 'requests' && joinRequests.length > 0 ? (
                <Badge count={joinRequests.length} size="small" offset={[8, -2]}>
                  <span style={{ color: 'inherit' }}>{TAB_LABELS[key]}</span>
                </Badge>
              ) : (
                TAB_LABELS[key]
              )}
            </button>
          ))}
        </div>
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
            ) : activeTab === 'contractors' ? (
              <>
                <p style={{ margin: '0 0 12px', color: 'var(--app-text-secondary)', fontSize: 13 }}>
                  Внешние исполнители без доступа к сервису. Их можно назначать на этапы заявок —
                  так команда видит, кто выполняет работу и как с ним связаться.
                </p>
                <Table<ExternalContractor>
                  rowKey="id"
                  columns={contractorColumns}
                  dataSource={contractors}
                  loading={loading}
                  locale={{ emptyText: 'Подрядчиков пока нет' }}
                  pagination={false}
                  size="middle"
                />
              </>
            ) : activeTab === 'requests' ? (
              <JoinRequestsTable
                requests={joinRequests}
                loading={loading}
                onDecided={(requestId, approved) => {
                  setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
                  if (approved && activeOrganizationId) {
                    void getMembers(activeOrganizationId).then(setMembers);
                  }
                }}
              />
            ) : (
              <Table<InvitationResponse>
                rowKey="id"
                columns={inviteColumns}
                dataSource={invitations}
                loading={loading}
                locale={{ emptyText: 'Нет ожидающих приглашений' }}
                pagination={false}
                size="middle"
              />
            )}
          </Card>
        )}
      </div>

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => { setInviteOpen(false); void load(); }}
        organizationId={activeOrganization.id}
      />

      <JoinLinkModal
        open={joinLinkOpen}
        organizationId={activeOrganization.id}
        onClose={() => setJoinLinkOpen(false)}
      />

      <ContractorModal
        open={contractorModal.open}
        organizationId={activeOrganization.id}
        contractor={contractorModal.contractor}
        onClose={() => setContractorModal({ open: false, contractor: null })}
        onSaved={(saved) => {
          setContractors((prev) => {
            const exists = prev.some((c) => c.id === saved.id);
            const next = exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved];
            return next.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'));
          });
          setContractorModal({ open: false, contractor: null });
        }}
      />

      <Modal
        open={!!resendResult}
        title="Приглашение отправлено повторно"
        onCancel={() => setResendResult(null)}
        footer={<Button type="primary" onClick={() => setResendResult(null)}>Готово</Button>}
      >
        {resendResult ? <InvitationResult invitation={resendResult} /> : null}
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--app-text-secondary)' }}>
          Прежняя ссылка больше не действует.
        </p>
      </Modal>

      <Modal
        open={!!confirmAction}
        title={confirmTitle}
        okText={
          confirmAction?.type === 'remove' ? 'Исключить' : confirmAction?.type === 'revoke' ? 'Отозвать' : 'Удалить'
        }
        cancelText="Отмена"
        okButtonProps={{ danger: true, loading: busyId === confirmAction?.id }}
        onCancel={() => setConfirmAction(null)}
        onOk={() => void handleConfirm()}
      />
    </div>
  );
};
