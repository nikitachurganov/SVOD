import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Table, Button, Tag, Modal, Alert, Card, Select, Tooltip, Dropdown, Badge, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  SendOutlined,
  SolutionOutlined,
  UserAddOutlined,
} from '../shared/ui/materialIcons';
import { useOrganization } from '../shared/hooks/organization.hooks';
import { useAuth } from '../shared/hooks/auth.hooks';
import { buildDisplayName } from '../shared/utils/userName';
import { localizeAppLink } from '../shared/lib/localizeLink';
import { IS_SURVEYS_APP } from '../shared/config/appMode';
import {
  deleteExternalContractor,
  getMembers,
  getSeatUsage,
  listExternalContractors,
  listJoinRequests,
  listOrgInvitations,
  removeMember,
  resendInvitation,
  revokeInvitation,
  updateMemberAiLimit,
  updateMemberRole,
} from '../shared/api/organizations.api';
import type {
  AssignableRole,
  ExternalContractor,
  InvitationResponse,
  JoinRequestResponse,
  MemberResponse,
  SeatUsage,
} from '../types/organization';
import { InviteMemberModal, InvitationResult } from '../components/organization/InviteMemberModal';
import { ContractorModal } from '../components/organization/ContractorModal';
import { MemberAiLimitInput } from '../components/organization/MemberAiLimitInput';
import { TeamQuotaSummary } from '../components/organization/TeamQuotaSummary';
import { ReturnedPaymentNotice } from '../components/billing/ReturnedPaymentNotice';
import { AddSeatsDialog } from '../components/billing/SeatsPanel';
import { DEFAULT_SEATS } from '../components/billing/seatPricing';
import { flowPath } from '../components/billing/upgradeFlow';
import { formatCredits, formatNumber } from '../components/billing/billingFormat';
import { getPlans } from '../shared/api/billing.api';
import { useSubscription } from '../shared/hooks/subscription.hooks';
import type { PlansResponse } from '../types/billing';
import { JoinLinkModal } from '../components/organization/JoinLinkModal';
import { JoinRequestsTable } from '../components/organization/JoinRequestsTable';
import {
  CONTACT_KIND_LABELS,
  copyToClipboard,
  isNoFreeSeat,
  roleWithSeat,
  seatOptionsFor,
  sharePercent,
  takesSeat,
} from '../components/organization/participants.utils';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const apiErrorText = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
};

type MemberRow = {
  /** The user's id for a member, the invitation's id for an invitation not answered yet */
  id: string;
  kind: 'member' | 'invitation';
  participant: string;
  email: string;
  role: string;
  job_title: string | null;
  joined_at: string;
  /** Personal cap of the member in the team's tokens+; null: none */
  token_plus_limit: number | null;
  /** Токены+ the member took from the team's pool in this period; null: not known */
  spent: number | null;
};

/** Free seats listed one by one; with more, the rest is one line */
const FREE_ROWS_SHOWN = 5;

type ParticipantsTabKey = 'members' | 'contractors' | 'requests' | 'invitations';

const TAB_LABELS: Record<ParticipantsTabKey, string> = {
  members: 'В команде',
  contractors: 'Подрядчики',
  requests: 'Заявки на вступление',
  invitations: 'Приглашения',
};

const TAB_KEYS = Object.keys(TAB_LABELS) as ParticipantsTabKey[];

type ConfirmAction =
  | { type: 'remove'; id: string; name: string }
  | { type: 'revoke'; id: string; name: string }
  | { type: 'delete-contractor'; id: string; name: string };

const isExpired = (inv: InvitationResponse): boolean =>
  Boolean(inv.expires_at && new Date(inv.expires_at).getTime() < Date.now());

export const ParticipantsPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useOrganization();
  const { user } = useAuth();
  const isOwner = !!activeOrganization && activeOrganization.owner_user_id === user?.id;

  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [seatUsage, setSeatUsage] = useState<SeatUsage | null>(null);
  const [invitations, setInvitations] = useState<InvitationResponse[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequestResponse[]>([]);
  const [joinLinkOpen, setJoinLinkOpen] = useState(false);
  const [contractors, setContractors] = useState<ExternalContractor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<AssignableRole>('editor');
  const [addSeatsOpen, setAddSeatsOpen] = useState(false);
  const [limitFor, setLimitFor] = useState<MemberRow | null>(null);
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const { subscription, team: teamBilling } = useSubscription();
  const [resendResult, setResendResult] = useState<InvitationResponse | null>(null);
  const [contractorModal, setContractorModal] = useState<{ open: boolean; contractor: ExternalContractor | null }>({
    open: false,
    contractor: null,
  });
  // The tab lives in the address (?tab=requests)
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ParticipantsTabKey | null;
  const activeTab: ParticipantsTabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'members';
  const setActiveTab = (key: ParticipantsTabKey) =>
    setSearchParams(key === 'members' ? {} : { tab: key }, { replace: true });
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const activeOrganizationId = activeOrganization?.id;
  // The owner and the admins manage people; only the owner makes admins and runs the join link
  const isAdmin = members.some((m) => m.user.id === user?.id && m.role_tag === 'admin');
  const canManage = isOwner || isAdmin;
  // Outside contractors are assigned to the stages of requests: the surveys service has no such thing
  const visibleTabs: ParticipantsTabKey[] = (
    canManage ? ['members', 'contractors', 'requests', 'invitations'] : ['members', 'contractors']
  ).filter((key) => !(IS_SURVEYS_APP && key === 'contractors')) as ParticipantsTabKey[];

  const refreshSeats = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      setSeatUsage(await getSeatUsage(activeOrganizationId));
    } catch {
      // The indicator is a hint: the page works without it
      setSeatUsage(null);
    }
  }, [activeOrganizationId]);

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true); setError(null);
    try {
      const [m, c] = await Promise.all([
        getMembers(activeOrganizationId),
        listExternalContractors(activeOrganizationId),
      ]);
      setMembers(m);
      setContractors(c);
      // Invitations, requests and places are for those who manage people; we know that only from the list
      const manages = isOwner || m.some((x) => x.user.id === user?.id && x.role_tag === 'admin');
      if (manages) {
        const [inv, jr] = await Promise.all([
          listOrgInvitations(activeOrganizationId),
          listJoinRequests(activeOrganizationId),
        ]);
        setInvitations(inv.filter((i) => i.status === 'pending'));
        setJoinRequests(jr);
      } else {
        setInvitations([]);
        setJoinRequests([]);
      }
      // The seats and the use of the plan are shown to every member (the spending of others only to managers)
      void refreshSeats();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
    } finally { setLoading(false); }
  }, [activeOrganizationId, isOwner, user?.id, refreshSeats]);

  useEffect(() => { void load(); }, [load]);

  // The owner buys seats: whether that is done in place (more seats to a running plan) depends on the catalogue
  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    getPlans()
      .then((next) => {
        if (!cancelled) setPlans(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  const runningResearcher =
    subscription?.plan.code === 'researcher' && subscription.status === 'active' && !subscription.trial_ends_at;

  /** «Докупить места»: more seats to a running plan here, or the way to the plan for a free team */
  const buySeats = useCallback(() => {
    if (!activeOrganization) return;
    if (teamBilling) {
      // The team model: the places come with the plan of the team (Plus 3, Pro 10), not one by one
      navigate('/plans');
      return;
    }
    const sellsSeats = Boolean(plans?.seat_pricing_enabled && plans.payments_enabled);
    if (sellsSeats && runningResearcher) {
      setAddSeatsOpen(true);
      return;
    }
    if (sellsSeats) {
      const taken = seatUsage?.seats_used ?? 1;
      navigate(
        flowPath('seats', {
          offer: 'researcher',
          term: 'year',
          who: 'team',
          seats: Math.max(DEFAULT_SEATS, taken + 1),
          org: activeOrganization.id,
        }),
      );
      return;
    }
    navigate('/settings?tab=plans');
  }, [teamBilling, activeOrganization, navigate, plans, runningResearcher, seatUsage?.seats_used]);

  const handleConfirm = useCallback(async () => {
    if (!confirmAction || !activeOrganizationId) return;
    setBusyId(confirmAction.id);
    try {
      if (confirmAction.type === 'remove') {
        await removeMember(activeOrganizationId, confirmAction.id);
        setMembers((prev) => prev.filter((m) => m.user.id !== confirmAction.id));
        void refreshSeats();
      } else if (confirmAction.type === 'revoke') {
        await revokeInvitation(confirmAction.id);
        setInvitations((prev) => prev.filter((i) => i.id !== confirmAction.id));
        void refreshSeats();
      } else {
        await deleteExternalContractor(activeOrganizationId, confirmAction.id);
        setContractors((prev) => prev.filter((c) => c.id !== confirmAction.id));
      }
      setConfirmAction(null);
    } catch (err) {
      message.error(apiErrorText(err, 'Не удалось выполнить действие'));
    } finally { setBusyId(null); }
  }, [activeOrganizationId, confirmAction, refreshSeats]);

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

  const changeRole = useCallback(async (userId: string, role: AssignableRole) => {
    if (!activeOrganizationId) return;
    setBusyId(userId);
    try {
      const updated = await updateMemberRole(activeOrganizationId, userId, role);
      setMembers((prev) => prev.map((m) => (m.user.id === userId ? updated : m)));
      message.success('Роль изменена');
      void refreshSeats();
    } catch (err: unknown) {
      // Often "no free seat": the 402 body is an object, not a string
      const detail = (err as { response?: { data?: { detail?: { code?: string } | string } } })
        ?.response?.data?.detail;
      if (typeof detail === 'object' && isNoFreeSeat(err)) {
        Modal.confirm({
          title: 'Свободных платных мест нет',
          content: isOwner
            ? 'Докупите место, и человек займёт его. Или оставьте его наблюдателем: это бесплатно.'
            : 'Попросите владельца команды докупить место или оставьте человека наблюдателем.',
          okText: isOwner ? 'Докупить место' : 'Понятно',
          cancelText: 'Отмена',
          okCancel: isOwner,
          onOk: isOwner ? buySeats : undefined,
        });
      } else {
        message.error(apiErrorText(err, 'Не удалось изменить роль'));
      }
    } finally { setBusyId(null); }
  }, [activeOrganizationId, buySeats, isOwner, refreshSeats]);

  const changeAiLimit = useCallback(async (userId: string, tokens: number | null) => {
    if (!activeOrganizationId) return;
    setBusyId(userId);
    try {
      const updated = await updateMemberAiLimit(activeOrganizationId, userId, tokens);
      setMembers((prev) => prev.map((m) => (m.user.id === userId ? updated : m)));
      message.success(tokens === null ? 'Личный лимит снят' : 'Личный лимит сохранён');
    } catch (err: unknown) {
      message.error(apiErrorText(err, 'Не удалось сохранить лимит'));
      // Put the value the server still has back into the field
      void getMembers(activeOrganizationId).then(setMembers);
    } finally { setBusyId(null); }
  }, [activeOrganizationId]);

  const hasPool = Boolean(seatUsage && typeof seatUsage.ai_pool_max === 'number');
  const poolMax = seatUsage?.ai_pool_max ?? 0;

  const memberRows = useMemo<MemberRow[]>(() => {
    const spentOf = (userId: string): number | null => {
      // Spending is known only while the team has a pool (a paid plan of the owner)
      if (!seatUsage || typeof seatUsage.ai_pool_max !== 'number') return null;
      if (userId === user?.id && typeof seatUsage.ai_spent_me === 'number') return seatUsage.ai_spent_me;
      // The others' spending comes to the owner and the admins only
      return canManage ? (seatUsage.ai_spent_by_user?.[userId] ?? 0) : null;
    };
    const people: MemberRow[] = members.map((m) => ({
      id: m.user.id,
      kind: 'member',
      participant: buildDisplayName(m.user) || '—',
      email: m.user.email,
      role: m.role_tag,
      job_title: m.job_title ?? null,
      joined_at: m.joined_at,
      token_plus_limit: m.token_plus_limit ?? null,
      spent: spentOf(m.user.id),
    }));
    // An unanswered invitation already holds its seat, so it is a row of the team too
    const waiting: MemberRow[] = invitations.map((inv) => ({
      id: inv.id,
      kind: 'invitation',
      participant: (inv.invited_user ? buildDisplayName(inv.invited_user) : '') || '—',
      email: inv.email,
      role: inv.role_tag,
      job_title: inv.job_title ?? null,
      joined_at: inv.created_at,
      token_plus_limit: null,
      spent: null,
    }));
    return [...people, ...waiting];
  }, [canManage, invitations, members, seatUsage, user?.id]);

  // Paid seats nobody has taken: shown as rows under the people, so the table adds up to the quota
  const seatsFree =
    seatUsage && seatUsage.seats_limit !== null ? Math.max(seatUsage.seats_limit - seatUsage.seats_used, 0) : 0;
  const freeSeatsKnown = seatUsage?.billing_enabled && seatUsage.seats_limit !== null ? seatsFree : null;

  const memberColumns = useMemo<ColumnsType<MemberRow>>(
    () => [
      {
        title: 'ФИО',
        dataIndex: 'participant',
        key: 'participant',
        sorter: (a, b) => a.participant.localeCompare(b.participant, 'ru'),
        render: (name: string, record) => (
          <div>
            <span className={record.kind === 'invitation' ? 'team-quota-pending' : undefined}>
              {name}
              {record.id === user?.id ? ' (вы)' : ''}
            </span>
            {record.kind === 'invitation' ? (
              <div>
                <Tag color="gold" style={{ marginTop: 4 }}>
                  Приглашён, ждёт ответа
                </Tag>
              </div>
            ) : null}
          </div>
        ),
      },
      {
        title: 'Почта',
        dataIndex: 'email',
        key: 'email',
        sorter: (a, b) => a.email.localeCompare(b.email, 'ru'),
        render: (email: string) => <span style={{ whiteSpace: 'nowrap' }}>{email}</span>,
      },
      {
        title: (
          <Tooltip title="Владелец, администраторы и редакторы занимают оплаченное место. Наблюдатели бесплатны.">
            <span>Место и роль</span>
          </Tooltip>
        ),
        dataIndex: 'role',
        key: 'role',
        sorter: (a, b) => a.role.localeCompare(b.role, 'ru'),
        render: (role: string, record) => {
          // An admin changes editors and observers; admins are touched by the owner only
          const editable =
            record.kind === 'member' &&
            canManage &&
            record.id !== user?.id &&
            role !== 'owner' &&
            (isOwner || role !== 'admin');
          if (editable) {
            return (
              <Select<AssignableRole>
                size="small"
                style={{ minWidth: 200 }}
                value={role === 'member' ? 'editor' : (role as AssignableRole)}
                options={seatOptionsFor(isOwner, freeSeatsKnown)}
                labelRender={({ value }) => roleWithSeat(String(value))}
                disabled={busyId === record.id}
                onChange={(value) => void changeRole(record.id, value)}
              />
            );
          }
          return <Tag color={takesSeat(role) ? 'blue' : 'green'}>{roleWithSeat(role)}</Tag>;
        },
      },
      ...(hasPool
        ? [
            {
              title: (
                <Tooltip title={teamBilling ? 'Сколько Токенов+ человек потратил в этом периоде и какая это доля квоты команды' : 'Сколько кредитов ИИ человек потратил в этом месяце и какая это доля общего тарифа команды'}>
                  <span>Расход ИИ</span>
                </Tooltip>
              ),
              dataIndex: 'spent',
              key: 'spent',
              sorter: (a: MemberRow, b: MemberRow) => (a.spent ?? -1) - (b.spent ?? -1),
              render: (spent: number | null, record: MemberRow) => {
                if (record.kind === 'invitation') return <span className="team-quota-pending">—</span>;
                if (!takesSeat(record.role)) {
                  return <span style={{ color: 'var(--app-text-secondary)' }}>ИИ недоступен</span>;
                }
                if (spent === null) return <span style={{ color: 'var(--app-text-secondary)' }}>—</span>;
                return (
                  <div className="team-quota-usage">
                    <span>
                      {teamBilling ? `${formatNumber(spent)} Токенов+` : `${formatCredits(spent)} кр.`}{' '}
                      <span className="team-quota-usage__share">· {sharePercent(spent, poolMax).text}</span>
                    </span>
                    {record.token_plus_limit !== null ? (
                      <span className="team-quota-usage__cap">лимит {teamBilling ? `${formatNumber(record.token_plus_limit)} Токенов+` : `${formatCredits(record.token_plus_limit)} кр.`}</span>
                    ) : null}
                  </div>
                );
              },
            },
          ]
        : []),
      {
        // No title: the actions are in the «⋯» menu of the row, and only where they exist
        title: '',
        key: 'actions',
        width: 56,
        align: 'right',
        render: (_, record) => {
          if (!canManage) return null;
          if (record.kind === 'invitation') {
            return (
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                menu={{
                  items: [
                    { key: 'resend', label: 'Отправить ещё раз' },
                    { key: 'revoke', label: 'Отозвать приглашение', danger: true },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'resend') void handleResend(record.id);
                    else setConfirmAction({ type: 'revoke', id: record.id, name: record.email });
                  },
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined />}
                  aria-label={`Действия с приглашением ${record.email}`}
                  disabled={busyId === record.id}
                />
              </Dropdown>
            );
          }
          if (record.id === user?.id || record.role === 'owner') return null;
          if (!isOwner && record.role === 'admin') return null;
          const canCap = hasPool && takesSeat(record.role);
          return (
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: [
                  ...(canCap ? [{ key: 'limit', label: 'Личный лимит ИИ…' }] : []),
                  { key: 'remove', label: 'Исключить из команды', danger: true },
                ],
                onClick: ({ key }) => {
                  if (key === 'limit') setLimitFor(record);
                  else setConfirmAction({ type: 'remove', id: record.id, name: record.participant });
                },
              }}
            >
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                aria-label={`Действия с участником ${record.participant}`}
                disabled={busyId === record.id}
              />
            </Dropdown>
          );
        },
      },
    ],
    [busyId, canManage, changeRole, freeSeatsKnown, handleResend, hasPool, isOwner, poolMax, teamBilling, user?.id],
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
                    const ok = await copyToClipboard(localizeAppLink(record.activation_url));
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

  const headerAction = canManage ? (
    <Dropdown
      classNames={{ root: 'app-menu-dropdown' }}
      trigger={['click']}
      menu={{
        items: [
          // The join link (create, switch off, renew) belongs to the owner
          ...(isOwner
            ? [
                {
                  key: 'link',
                  icon: <LinkOutlined />,
                  label: 'Пригласить по ссылке',
                  extra: 'с модерацией',
                },
              ]
            : []),
          { key: 'manual', icon: <UserAddOutlined />, label: 'Добавить вручную', extra: 'аккаунт + письмо' },
          // Outside contractors are kept by the owner only (the server refuses an admin)
          ...(isOwner && !IS_SURVEYS_APP
            ? [
                { type: 'divider' as const },
                { key: 'contractor', icon: <SolutionOutlined />, label: 'Добавить подрядчика', extra: 'без входа' },
              ]
            : []),
        ],
        onClick: ({ key }) => {
          if (key === 'link') setJoinLinkOpen(true);
          else if (key === 'manual') {
            // Without a free paid seat the form opens with the free role, so it can be sent at once
            setInviteRole(freeSeatsKnown === 0 ? 'reader' : 'editor');
            setInviteOpen(true);
          }
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
        <ReturnedPaymentNotice onSettled={refreshSeats} />
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
              <>
              {seatUsage?.billing_enabled ? (
                <TeamQuotaSummary usage={seatUsage} canBuy={isOwner} onBuy={buySeats} manages={canManage} team={teamBilling} />
              ) : null}
              <Table<MemberRow>
                rowKey={(row) => `${row.kind}:${row.id}`}
                columns={memberColumns}
                dataSource={memberRows}
                loading={loading}
                locale={{ emptyText: 'Нет участников' }}
                pagination={false}
                // On a phone the table scrolls inside the card instead of squeezing the e-mails letter by letter
                scroll={{ x: 'max-content' }}
                size="middle"
                summary={
                  seatUsage?.billing_enabled && seatsFree > 0
                    ? () => (
                        <Table.Summary>
                          {Array.from({ length: Math.min(seatsFree, FREE_ROWS_SHOWN) }, (_, index) => (
                            <Table.Summary.Row key={`free-${index}`}>
                              <Table.Summary.Cell index={0} colSpan={memberColumns.length}>
                                <div className="team-quota-free-row">
                                  <span>
                                    <strong>Свободное место</strong> — оплачено, пока не занято
                                  </span>
                                  {canManage ? (
                                    <Button
                                      type="link"
                                      size="small"
                                      onClick={() => {
                                        setInviteRole('editor');
                                        setInviteOpen(true);
                                      }}
                                    >
                                      Пригласить
                                    </Button>
                                  ) : null}
                                </div>
                              </Table.Summary.Cell>
                            </Table.Summary.Row>
                          ))}
                          {seatsFree > FREE_ROWS_SHOWN ? (
                            <Table.Summary.Row>
                              <Table.Summary.Cell index={0} colSpan={memberColumns.length}>
                                <div className="team-quota-free-row">
                                  <span>И ещё свободных мест: {seatsFree - FREE_ROWS_SHOWN}</span>
                                </div>
                              </Table.Summary.Cell>
                            </Table.Summary.Row>
                          ) : null}
                        </Table.Summary>
                      )
                    : undefined
                }
              />
              </>
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
                canAssignAdmin={isOwner}
                onDecided={(requestId, approved) => {
                  setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
                  if (approved && activeOrganizationId) {
                    void getMembers(activeOrganizationId).then(setMembers);
                    void refreshSeats();
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
        canAssignAdmin={isOwner}
        freeSeats={freeSeatsKnown}
        initialRole={inviteRole}
        onBuySeats={
          isOwner
            ? () => {
                setInviteOpen(false);
                buySeats();
              }
            : undefined
        }
      />

      {addSeatsOpen && subscription ? (
        <AddSeatsDialog
          current={subscription.seats}
          max={plans?.max_seats ?? subscription.seats + 1}
          windowDaysLeft={subscription.seat_window_days_left}
          periodEnd={subscription.current_period_end}
          initialTarget={subscription.seats + 1}
          returnTo="participants"
          onClose={() => setAddSeatsOpen(false)}
        />
      ) : null}

      <Modal
        open={!!limitFor}
        title={limitFor ? `Личный лимит ИИ: ${limitFor.participant}` : ''}
        footer={<Button onClick={() => setLimitFor(null)}>Готово</Button>}
        onCancel={() => setLimitFor(null)}
        destroyOnHidden
      >
        <p style={{ marginTop: 0, color: 'var(--app-text-secondary)' }}>
          {teamBilling
            ? 'Сколько Токенов+ в месяц человек может потратить из общего баланса команды. Пустое поле — без ограничения.'
            : 'Сколько кредитов ИИ в месяц человек может потратить из общего тарифа команды. Пустое поле — без ограничения.'}
        </p>
        {limitFor ? (
          <MemberAiLimitInput
            value={limitFor.token_plus_limit}
            unit={teamBilling ? 'tokens_plus' : 'credits'}
            disabled={busyId === limitFor.id}
            onCommit={(tokens) => {
              void changeAiLimit(limitFor.id, tokens);
              setLimitFor((current) => (current ? { ...current, token_plus_limit: tokens } : current));
            }}
          />
        ) : null}
      </Modal>

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
