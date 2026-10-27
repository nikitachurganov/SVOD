import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Input, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import { ReloadOutlined } from '@ant-design/icons';
import { adminErrorText, listAdminUsers } from '../../shared/api/admin.api';
import type {
  AdminSortField,
  AdminTier,
  AdminUserRow,
  AdminUsersQuery,
  Paged,
} from '../../types/admin';
import { PLAN_TITLES, STATUS_LABELS, formatDate, formatDateTime, personName } from './adminLabels';

const PAGE_SIZE = 25;

const TIER_OPTIONS = [
  { value: 'free', label: 'Бесплатный «Старт»' },
  { value: 'paid', label: 'Платный' },
  { value: 'trial', label: 'Пробный период' },
  { value: 'past_due', label: 'Ожидает оплаты' },
];

const VERIFIED_OPTIONS = [
  { value: 'yes', label: 'Почта подтверждена' },
  { value: 'no', label: 'Почта не подтверждена' },
];

const ACTIVE_OPTIONS = [
  { value: 'yes', label: 'Активные' },
  { value: 'no', label: 'Заблокированные' },
];

const muted = { color: 'var(--app-text-secondary)' } as const;

interface Props {
  onOpenUser: (userId: string) => void;
  /** Changes when something in the drawer was saved, so the table reloads */
  refreshKey: number;
}

export const AdminUsersTab = ({ onOpenUser, refreshKey }: Props) => {
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<AdminTier | undefined>();
  const [verified, setVerified] = useState<'yes' | 'no' | undefined>();
  const [active, setActive] = useState<'yes' | 'no' | undefined>();
  const [sort, setSort] = useState<AdminSortField>('created_at');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AdminUserRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo<AdminUsersQuery>(
    () => ({
      q: search.trim() || undefined,
      tier,
      email_verified: verified === undefined ? undefined : verified === 'yes',
      is_active: active === undefined ? undefined : active === 'yes',
      sort,
      direction,
      page,
      page_size: PAGE_SIZE,
    }),
    [search, tier, verified, active, sort, direction, page],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listAdminUsers(query));
    } catch (err) {
      setError(adminErrorText(err, 'Не удалось загрузить пользователей'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // A filter changes the result, so the first page is shown again
  const withFirstPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const columns = useMemo<ColumnsType<AdminUserRow>>(() => {
    const sortOrder = (field: AdminSortField) =>
      sort === field ? (direction === 'asc' ? ('ascend' as const) : ('descend' as const)) : null;
    return [
      {
        title: 'Пользователь',
        key: 'name',
        sorter: true,
        sortOrder: sortOrder('name'),
        width: 240,
        render: (_, row) => (
          <div>
            <div>{personName(row) || '—'}</div>
            <div style={{ fontSize: 12, ...muted }}>{row.email}</div>
          </div>
        ),
      },
      {
        title: 'Телефон',
        dataIndex: 'phone_number',
        key: 'phone',
        width: 140,
        render: (value: string) => value || '—',
      },
      {
        title: 'Почта',
        key: 'verified',
        width: 140,
        render: (_, row) =>
          row.email_verified ? <Tag color="success">Подтверждена</Tag> : <Tag>Не подтверждена</Tag>,
      },
      {
        title: 'Регистрация',
        dataIndex: 'created_at',
        key: 'created_at',
        sorter: true,
        sortOrder: sortOrder('created_at'),
        width: 130,
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Последний вход',
        dataIndex: 'last_login_at',
        key: 'last_login_at',
        sorter: true,
        sortOrder: sortOrder('last_login_at'),
        width: 160,
        render: (value: string | null) =>
          value ? formatDateTime(value) : <span style={muted}>не входил</span>,
      },
      {
        title: 'Тариф',
        key: 'plan_ends_at',
        sorter: true,
        sortOrder: sortOrder('plan_ends_at'),
        width: 200,
        render: (_, row) => (
          <div>
            <Tag color={row.plan_code === 'start' ? 'default' : 'blue'}>
              {PLAN_TITLES[row.plan_code] ?? row.plan_title}
            </Tag>
            {row.plan_code !== 'start' ? (
              <div style={{ fontSize: 12, ...muted }}>
                {STATUS_LABELS[row.subscription_status] ?? row.subscription_status}
                {row.plan_ends_at ? ` до ${formatDate(row.plan_ends_at)}` : ''}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        title: 'ИИ',
        key: 'ai',
        width: 90,
        render: (_, row) => `${row.ai_actions_used} / ${row.ai_actions_max}`,
      },
      { title: 'Опросов', dataIndex: 'surveys_count', key: 'surveys', width: 90 },
      { title: 'Ответов', dataIndex: 'responses_count', key: 'responses', width: 90 },
      {
        title: 'Статус',
        key: 'state',
        width: 220,
        render: (_, row) => (
          <Space size={[4, 4]} wrap>
            {row.role === 'admin' ? <Tag color="purple">Администратор</Tag> : null}
            {row.is_active ? <Tag color="success">Активен</Tag> : <Tag color="error">Заблокирован</Tag>}
            {!row.ai_enabled ? <Tag color="warning">ИИ выключен</Tag> : null}
            {row.deletion_requested_at ? <Tag color="orange">Удаление запрошено</Tag> : null}
          </Space>
        ),
      },
    ];
  }, [sort, direction]);

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: unknown,
    sorter: SorterResult<AdminUserRow> | SorterResult<AdminUserRow>[],
  ) => {
    const one = Array.isArray(sorter) ? sorter[0] : sorter;
    const field = one?.columnKey as AdminSortField | undefined;
    if (field && one?.order) {
      setSort(field);
      setDirection(one.order === 'ascend' ? 'asc' : 'desc');
    } else {
      setSort('created_at');
      setDirection('desc');
    }
    setPage(pagination.current ?? 1);
  };

  return (
    <Card className="registry-page__card">
      <div className="admin-filters">
        <Input.Search
          allowClear
          placeholder="Поиск по имени или почте"
          className="admin-filters__search"
          onSearch={withFirstPage(setSearch)}
        />
        <Select
          allowClear
          placeholder="Тариф"
          options={TIER_OPTIONS}
          value={tier}
          onChange={withFirstPage((value: AdminTier | undefined) => setTier(value))}
          className="admin-filters__select"
        />
        <Select
          allowClear
          placeholder="Почта"
          options={VERIFIED_OPTIONS}
          value={verified}
          onChange={withFirstPage((value: 'yes' | 'no' | undefined) => setVerified(value))}
          className="admin-filters__select"
        />
        <Select
          allowClear
          placeholder="Аккаунт"
          options={ACTIVE_OPTIONS}
          value={active}
          onChange={withFirstPage((value: 'yes' | 'no' | undefined) => setActive(value))}
          className="admin-filters__select"
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()} aria-label="Обновить" />
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          title="Ошибка загрузки"
          description={error}
          action={
            <Button size="small" onClick={() => void load()}>
              Повторить
            </Button>
          }
        />
      ) : (
        <Table<AdminUserRow>
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={loading}
          size="middle"
          scroll={{ x: 1380 }}
          locale={{ emptyText: 'Никого не найдено' }}
          onChange={handleTableChange}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => `Всего: ${total}`,
          }}
          onRow={(row) => ({
            onClick: () => onOpenUser(row.id),
            style: { cursor: 'pointer' },
          })}
        />
      )}
    </Card>
  );
};
