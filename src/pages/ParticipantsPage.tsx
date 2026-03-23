import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTable,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableToolbar,
  TableToolbarContent,
  Button,
  InlineNotification,
  Tag,
  Modal,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  DataTableSkeleton,
} from '@carbon/react';
import { Add } from '@carbon/react/icons';
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const MEMBER_HEADERS = [
  { key: 'participant', header: 'Участник' },
  { key: 'role', header: 'Роль' },
  { key: 'joined_at', header: 'Дата вступления' },
  { key: 'actions', header: 'Действия' },
];

const INVITE_HEADERS = [
  { key: 'email', header: 'Email' },
  { key: 'status', header: 'Статус' },
  { key: 'created_at', header: 'Дата отправки' },
  { key: 'actions', header: 'Действия' },
];

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
  const [confirmAction, setConfirmAction] = useState<{ type: 'remove' | 'revoke'; id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    setLoading(true); setError(null);
    try {
      const [m, inv] = await Promise.all([
        getMembers(activeOrganization.id),
        isOwner ? listOrgInvitations(activeOrganization.id) : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvitations(inv.filter((i) => i.status === 'pending'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные');
    } finally { setLoading(false); }
  }, [activeOrganization?.id, isOwner]);

  useEffect(() => { void load(); }, [load]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!activeOrganization) return;
    setRemovingId(userId);
    try {
      await removeMember(activeOrganization.id, userId);
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
    } catch { /* handled */ } finally { setRemovingId(null); setConfirmAction(null); }
  }, [activeOrganization?.id]);

  const handleRevokeInvitation = useCallback(async (invId: string) => {
    setRevokingId(invId);
    try {
      await revokeInvitation(invId);
      setInvitations((prev) => prev.filter((i) => i.id !== invId));
    } catch { /* handled */ } finally { setRevokingId(null); setConfirmAction(null); }
  }, []);

  const memberRows = useMemo(() => members.map((m) => ({
    id: m.user.id,
    participant: buildDisplayName(m.user) || '—',
    email: m.user.email,
    role: m.role_tag,
    joined_at: m.joined_at,
    actions: m.user.id,
  })), [members]);

  const inviteRows = useMemo(() => invitations.map((i) => ({
    id: i.id,
    email: i.email,
    status: 'pending',
    created_at: i.created_at,
    actions: i.id,
  })), [invitations]);

  if (!activeOrganization) return null;

  const renderMemberCell = (key: string, value: unknown, rowId: string) => {
    const member = members.find((m) => m.user.id === rowId);
    switch (key) {
      case 'participant': {
        return (
          <div>
            <div>{value as string}</div>
            <div style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>{member?.user.email}</div>
          </div>
        );
      }
      case 'role':
        return <Tag type={(value as string) === 'owner' ? 'warm-gray' : 'blue'} size="sm">{(value as string) === 'owner' ? 'Владелец' : 'Участник'}</Tag>;
      case 'joined_at':
        return formatDate(value as string);
      case 'actions': {
        if (!isOwner || (value as string) === user?.id || member?.role_tag === 'owner') return null;
        return <Button kind="danger--ghost" size="sm" disabled={removingId === (value as string)} onClick={() => setConfirmAction({ type: 'remove', id: value as string, name: buildDisplayName(member!.user) })}>Исключить</Button>;
      }
      default: return value as string;
    }
  };

  const renderInviteCell = (key: string, value: unknown) => {
    switch (key) {
      case 'status': return <Tag type="warm-gray" size="sm">Ожидает</Tag>;
      case 'created_at': return formatDate(value as string);
      case 'actions':
        return <Button kind="danger--ghost" size="sm" disabled={revokingId === (value as string)} onClick={() => setConfirmAction({ type: 'revoke', id: value as string, name: (value as string) })}>Отозвать</Button>;
      default: return value as string;
    }
  };

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {error ? (
        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <InlineNotification kind="error" title="Ошибка загрузки" subtitle={error} lowContrast />
          <Button kind="ghost" size="sm" onClick={() => void load()}>
            Повторить
          </Button>
        </div>
      ) : (
        <Tabs>
          {/* Page header: title then tabs */}
          <div
            style={{
              background: 'var(--cds-layer-01)',
              borderBottom: '1px solid var(--cds-border-subtle)',
              padding: '12px 16px 0',
            }}
          >
            <h4 style={{ margin: '0 0 12px' }}>Участники</h4>
            <TabList aria-label="Участники">
              <Tab>В организации</Tab>
              {isOwner && <Tab>Приглашения</Tab>}
            </TabList>
          </div>

          <TabPanels>
            {/* Members tab */}
            <TabPanel style={{ padding: 0 }}>
              {loading ? (
                <div style={{ padding: 16 }}>
                  <DataTableSkeleton headers={MEMBER_HEADERS} rowCount={5} />
                </div>
              ) : (
                <DataTable rows={memberRows} headers={MEMBER_HEADERS}>
                  {({ rows: cRows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                    <TableContainer>
                      {isOwner && (
                        <TableToolbar>
                          <TableToolbarContent>
                            <Button renderIcon={Add} onClick={() => setInviteOpen(true)}>
                              Пригласить
                            </Button>
                          </TableToolbarContent>
                        </TableToolbar>
                      )}
                      <Table {...getTableProps()} size="lg">
                        <TableHead>
                          <TableRow>
                            {headers.map((h) => {
                              const { key: _k, ...hp } = getHeaderProps({ header: h });
                              return <TableHeader key={h.key} {...hp}>{h.header}</TableHeader>;
                            })}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {cRows.length === 0
                            ? <TableRow><TableCell colSpan={headers.length} style={{ textAlign: 'center' }}>Нет участников</TableCell></TableRow>
                            : cRows.map((row) => {
                                const { key: _k, ...rp } = getRowProps({ row });
                                return (
                                  <TableRow key={row.id} {...rp}>
                                    {row.cells.map((c) => (
                                      <TableCell key={c.id}>
                                        {renderMemberCell(c.info.header, c.value, row.id)}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                );
                              })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </DataTable>
              )}
            </TabPanel>

            {/* Invitations tab */}
            {isOwner && (
              <TabPanel style={{ padding: 0 }}>
                {loading ? (
                  <div style={{ padding: 16 }}>
                    <DataTableSkeleton headers={INVITE_HEADERS} rowCount={3} />
                  </div>
                ) : (
                  <DataTable rows={inviteRows} headers={INVITE_HEADERS}>
                    {({ rows: cRows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                      <TableContainer>
                        <Table {...getTableProps()} size="lg">
                          <TableHead>
                            <TableRow>
                              {headers.map((h) => {
                                const { key: _k, ...hp } = getHeaderProps({ header: h });
                                return <TableHeader key={h.key} {...hp}>{h.header}</TableHeader>;
                              })}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {cRows.length === 0
                              ? <TableRow><TableCell colSpan={headers.length} style={{ textAlign: 'center' }}>Нет ожидающих приглашений</TableCell></TableRow>
                              : cRows.map((row) => {
                                  const { key: _k, ...rp } = getRowProps({ row });
                                  return (
                                    <TableRow key={row.id} {...rp}>
                                      {row.cells.map((c) => (
                                        <TableCell key={c.id}>
                                          {renderInviteCell(c.info.header, c.value)}
                                        </TableCell>
                                      ))}
                                    </TableRow>
                                  );
                                })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </DataTable>
                )}
              </TabPanel>
            )}
          </TabPanels>
        </Tabs>
      )}

      <InviteMemberModal open={inviteOpen} onClose={() => { setInviteOpen(false); void load(); }} organizationId={activeOrganization.id} />

      {confirmAction && (
        <Modal open danger modalHeading={confirmAction.type === 'remove' ? `Исключить ${confirmAction.name}?` : 'Отозвать приглашение?'} primaryButtonText={confirmAction.type === 'remove' ? 'Исключить' : 'Отозвать'} secondaryButtonText="Отмена" onRequestClose={() => setConfirmAction(null)} onRequestSubmit={() => void (confirmAction.type === 'remove' ? handleRemoveMember(confirmAction.id) : handleRevokeInvitation(confirmAction.id))} size="xs" />
      )}
    </div>
  );
};
