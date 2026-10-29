import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Popconfirm,
  Progress,
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  adminErrorText,
  getAdminUser,
  patchAdminUser,
  revokeAdminPlan,
} from '../../shared/api/admin.api';
import { useAuth } from '../../shared/hooks/auth.hooks';
import type {
  AdminAiLogRow,
  AdminEvent,
  AdminPayment,
  AdminPlanRequest,
  AdminUserDetail,
  UsageMetric,
} from '../../types/admin';
import { formatNumber, formatTokens, isUnlimited } from '../billing/billingFormat';
import { GrantPlanModal } from './GrantPlanModal';
import {
  AI_ACTION_LABELS,
  EVENT_LABELS,
  INTERVAL_LABELS,
  LIMIT_LABELS,
  PAYMENT_STATUS_LABELS,
  PLAN_TITLES,
  REQUEST_TERM_LABELS,
  STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatRub,
  formatUsd,
  personName,
} from './adminLabels';

const muted = { color: 'var(--app-text-secondary)' } as const;

const REQUEST_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ждёт решения', color: 'gold' },
  approved: { label: 'Одобрена', color: 'success' },
  rejected: { label: 'Отклонена', color: 'error' },
};

const UsageBar = ({
  label,
  metric,
  format = formatNumber,
}: {
  label: string;
  metric: UsageMetric;
  format?: (value: number) => string;
}) => {
  const unlimited = isUnlimited(metric.max);
  const percent = metric.max > 0 ? Math.min(100, Math.round((metric.used / metric.max) * 100)) : 0;
  return (
    <div className="admin-usage">
      <div className="admin-usage__head">
        <span>{label}</span>
        <span style={muted}>
          {unlimited ? `${format(metric.used)}, без ограничений` : `${format(metric.used)} из ${format(metric.max)}`}
        </span>
      </div>
      {unlimited ? null : (
        <Progress
          percent={percent}
          showInfo={false}
          size="small"
          status={metric.max > 0 && metric.used >= metric.max ? 'exception' : 'normal'}
        />
      )}
    </div>
  );
};

/** A short human line for the interesting parts of an event's payload */
const eventDetails = (event: AdminEvent): string => {
  const p = event.payload ?? {};
  const parts: string[] = [];
  if (typeof p.until === 'string') parts.push(`до ${formatDate(p.until)}`);
  if (typeof p.days === 'number') parts.push(`${p.days} дн.`);
  if (typeof p.count === 'number') parts.push(`${p.count} шт.`);
  if (typeof p.closed_surveys === 'number' && p.closed_surveys > 0) {
    parts.push(`закрыто опросов: ${p.closed_surveys}`);
  }
  if (typeof p.reason === 'string' && p.reason) parts.push(`причина: ${p.reason}`);
  if (typeof p.note === 'string' && p.note) parts.push(p.note);
  return parts.join(' · ');
};

const EventList = ({ events }: { events: AdminEvent[] }) =>
  events.length === 0 ? (
    <p style={muted}>Событий пока нет.</p>
  ) : (
    <ul className="admin-events">
      {events.map((event) => (
        <li key={event.id} className="admin-events__item">
          <div>{EVENT_LABELS[event.kind] ?? event.kind}</div>
          <div style={{ fontSize: 12, ...muted }}>
            {formatDateTime(event.created_at)}
            {event.actor_email ? ` · ${event.actor_email}` : ''}
          </div>
          {eventDetails(event) ? (
            <div style={{ fontSize: 12, ...muted }}>{eventDetails(event)}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );

const aiColumns = [
  { title: 'Когда', dataIndex: 'created_at', key: 'at', render: (v: string) => formatDateTime(v) },
  {
    title: 'Действие',
    dataIndex: 'action',
    key: 'action',
    render: (v: string) => AI_ACTION_LABELS[v] ?? v,
  },
  {
    title: 'Токены',
    key: 'tokens',
    render: (_: unknown, row: AdminAiLogRow) => `${row.prompt_tokens} + ${row.completion_tokens}`,
  },
  {
    title: 'Стоимость',
    dataIndex: 'cost_usd',
    key: 'cost',
    render: (v: number | null) => (v === null ? '—' : formatUsd(v)),
  },
  {
    title: 'Итог',
    dataIndex: 'status',
    key: 'status',
    render: (v: string) => (v === 'ok' ? <Tag color="success">ок</Tag> : <Tag color="error">{v}</Tag>),
  },
];

const paymentColumns = [
  {
    title: 'Когда',
    key: 'at',
    render: (_: unknown, row: AdminPayment) => formatDateTime(row.paid_at ?? row.created_at),
  },
  {
    title: 'Срок',
    dataIndex: 'term',
    key: 'term',
    render: (v: string) => REQUEST_TERM_LABELS[v] ?? v,
  },
  {
    title: 'Сумма',
    key: 'amount',
    render: (_: unknown, row: AdminPayment) =>
      `${formatRub(row.amount_kopecks)}${row.refunded_kopecks > 0 ? ` (возврат ${formatRub(row.refunded_kopecks)})` : ''}`,
  },
  {
    title: 'Статус',
    key: 'status',
    render: (_: unknown, row: AdminPayment) => {
      const state = PAYMENT_STATUS_LABELS[row.status] ?? { label: row.status, color: 'default' };
      return (
        <>
          <Tag color={state.color}>{state.label}</Tag>
          {row.is_test ? <Tag>Тест</Tag> : null}
          {row.failure_reason ? <div style={{ fontSize: 12, ...muted }}>{row.failure_reason}</div> : null}
        </>
      );
    },
  },
  {
    title: 'ID в ЮKassa',
    dataIndex: 'provider_payment_id',
    key: 'provider',
    render: (v: string | null) => (v ? <code>{v}</code> : '—'),
  },
];

const RequestList = ({ requests }: { requests: AdminPlanRequest[] }) =>
  requests.length === 0 ? (
    <p style={muted}>Заявок не было.</p>
  ) : (
    <ul className="admin-events">
      {requests.map((request) => {
        const state = REQUEST_STATUS[request.status];
        return (
          <li key={request.id} className="admin-events__item">
            <div>
              {PLAN_TITLES[request.plan_code] ?? request.plan_code}{' '}
              {REQUEST_TERM_LABELS[request.billing_interval] ?? request.billing_interval}{' '}
              <Tag color={state?.color}>{state?.label ?? request.status}</Tag>
            </div>
            <div style={{ fontSize: 12, ...muted }}>
              {formatDateTime(request.created_at)} · контакт: {request.contact}
            </div>
            {request.comment ? <div style={{ fontSize: 12 }}>{request.comment}</div> : null}
            {request.decision_note ? (
              <div style={{ fontSize: 12, ...muted }}>Решение: {request.decision_note}</div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );

interface Props {
  userId: string | null;
  onClose: () => void;
  /** Something was saved: the lists behind the drawer should reload */
  onChanged: () => void;
}

export const AdminUserDrawer = ({ userId, onClose, onChanged }: Props) => {
  const { user: me } = useAuth();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);

  const load = useCallback(async (id: string) => {
    setError(null);
    try {
      setDetail(await getAdminUser(id));
    } catch (err) {
      setError(adminErrorText(err, 'Не удалось загрузить карточку'));
    }
  }, []);

  useEffect(() => {
    setDetail(null);
    if (userId) void load(userId);
  }, [userId, load]);

  const apply = async (action: () => Promise<AdminUserDetail>, done: string) => {
    setBusy(true);
    try {
      setDetail(await action());
      message.success(done);
      onChanged();
    } catch (err) {
      message.error(adminErrorText(err, 'Не удалось выполнить действие'));
    } finally {
      setBusy(false);
    }
  };

  const user = detail?.user;
  const subscription = detail?.subscription;
  const usage = detail?.usage;
  const isSelf = !!user && user.id === me?.id;
  const paid = !!subscription && subscription.plan_code !== 'start';

  const overview = detail && user && subscription && usage && (
    <>
      <Descriptions
        size="small"
        column={1}
        items={[
          { key: 'phone', label: 'Телефон', children: user.phone_number || '—' },
          {
            key: 'mail',
            label: 'Почта',
            children: user.email_verified ? 'подтверждена' : 'не подтверждена',
          },
          { key: 'created', label: 'Регистрация', children: formatDateTime(user.created_at) },
          {
            key: 'login',
            label: 'Последний вход',
            children: user.last_login_at ? formatDateTime(user.last_login_at) : 'не входил',
          },
          { key: 'surveys', label: 'Опросов', children: user.surveys_count },
          { key: 'responses', label: 'Ответов', children: user.responses_count },
          ...(user.deletion_requested_at
            ? [
                {
                  key: 'deletion',
                  label: 'Удаление аккаунта',
                  children: `запрошено ${formatDate(user.deletion_requested_at)}`,
                },
              ]
            : []),
        ]}
      />

      <h3 className="admin-section">Тариф</h3>
      <Descriptions
        size="small"
        column={1}
        items={[
          {
            key: 'plan',
            label: 'Тариф',
            children: (
              <Space size={4}>
                <Tag color={paid ? 'blue' : 'default'}>
                  {PLAN_TITLES[subscription.plan_code] ?? subscription.plan_title}
                </Tag>
                {STATUS_LABELS[subscription.status] ?? subscription.status}
              </Space>
            ),
          },
          ...(paid
            ? [
                {
                  key: 'until',
                  label: 'Действует до',
                  children: formatDateTime(subscription.current_period_end),
                },
                {
                  key: 'interval',
                  label: 'Оплата',
                  children: INTERVAL_LABELS[subscription.billing_interval] ?? subscription.billing_interval,
                },
                ...(subscription.cancel_at_period_end
                  ? [{ key: 'cancel', label: 'Продление', children: 'отменено' }]
                  : []),
              ]
            : []),
        ]}
      />
      {subscription.limit_overrides && Object.keys(subscription.limit_overrides).length > 0 ? (
        <div className="admin-overrides">
          <div style={{ fontSize: 12, ...muted }}>Личные лимиты</div>
          {Object.entries(subscription.limit_overrides).map(([key, value]) => (
            <Tag key={key}>
              {LIMIT_LABELS[key as keyof typeof LIMIT_LABELS] ?? key}: {value}
            </Tag>
          ))}
        </div>
      ) : null}

      <h3 className="admin-section">Использование за период</h3>
      <UsageBar label="Токены ИИ" metric={usage.ai_tokens} format={formatTokens} />
      <UsageBar label="Ответы" metric={usage.responses} />
      <UsageBar label="Открытые опросы" metric={usage.active_surveys} />
      <UsageBar label="Проекты" metric={usage.projects} />
      <p style={{ margin: '8px 0 0', fontSize: 13 }}>
        Расход ИИ за 30 дней: <strong>{formatUsd(usage.ai_cost_usd_30d)}</strong>
        {usage.locked_responses > 0 ? (
          <>
            <br />
            Ответов сверх квоты ждут тарифа: <strong>{usage.locked_responses}</strong>
          </>
        ) : null}
      </p>

      <h3 className="admin-section">Действия</h3>
      <div className="admin-actions">
        <div className="admin-actions__row">
          <span>Аккаунт активен</span>
          {user.is_active ? (
            <Tooltip title={isSelf ? 'Нельзя заблокировать себя' : ''}>
              <Popconfirm
                title="Заблокировать аккаунт?"
                description="Человек сразу потеряет доступ. Данные сохранятся."
                okText="Заблокировать"
                cancelText="Отмена"
                okButtonProps={{ danger: true }}
                disabled={isSelf}
                onConfirm={() =>
                  void apply(() => patchAdminUser(user.id, { is_active: false }), 'Аккаунт заблокирован')
                }
              >
                <Switch checked disabled={isSelf || busy} aria-label="Аккаунт активен" />
              </Popconfirm>
            </Tooltip>
          ) : (
            <Switch
              checked={false}
              disabled={busy}
              aria-label="Аккаунт активен"
              onChange={() =>
                void apply(() => patchAdminUser(user.id, { is_active: true }), 'Аккаунт разблокирован')
              }
            />
          )}
        </div>
        <div className="admin-actions__row">
          <span>ИИ разрешён</span>
          <Switch
            checked={user.ai_enabled}
            disabled={busy}
            aria-label="ИИ разрешён"
            onChange={(checked) =>
              void apply(
                () => patchAdminUser(user.id, { ai_enabled: checked }),
                checked ? 'ИИ включён' : 'ИИ отключён',
              )
            }
          />
        </div>
        <Space wrap>
          <Button type="primary" disabled={busy} onClick={() => setGrantOpen(true)}>
            Выдать тариф
          </Button>
          {paid ? (
            <Popconfirm
              title="Снять платный тариф?"
              description="Человек сразу перейдёт на «Старт». Лишние открытые опросы будут закрыты, данные сохранятся."
              okText="Снять"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={() => void apply(() => revokeAdminPlan(user.id), 'Тариф снят')}
            >
              <Button danger disabled={busy}>
                Снять тариф
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      </div>
    </>
  );

  return (
    <Drawer
      open={!!userId}
      onClose={onClose}
      size={560}
      rootClassName="admin-drawer"
      destroyOnHidden
      title={
        user ? (
          <div>
            <div>{personName(user) || user.email}</div>
            <div style={{ fontSize: 12, fontWeight: 400, ...muted }}>{user.email}</div>
          </div>
        ) : (
          'Пользователь'
        )
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          title="Ошибка"
          description={error}
          action={
            userId ? (
              <Button size="small" onClick={() => void load(userId)}>
                Повторить
              </Button>
            ) : null
          }
        />
      ) : !detail ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <Tabs
          items={[
            { key: 'overview', label: 'Обзор', children: overview },
            { key: 'events', label: 'Журнал', children: <EventList events={detail.events} /> },
            {
              key: 'ai',
              label: 'ИИ',
              children: (
                <Table<AdminAiLogRow>
                  rowKey="id"
                  size="small"
                  columns={aiColumns}
                  dataSource={detail.ai_usage}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  locale={{ emptyText: 'ИИ не использовался' }}
                />
              ),
            },
            {
              key: 'payments',
              label: 'Платежи',
              children: (
                <Table<AdminPayment>
                  rowKey="id"
                  size="small"
                  columns={paymentColumns}
                  dataSource={detail.payments}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  locale={{ emptyText: 'Платежей не было' }}
                />
              ),
            },
            {
              key: 'requests',
              label: 'Заявки',
              children: <RequestList requests={detail.plan_requests} />,
            },
          ]}
        />
      )}

      {detail ? (
        <GrantPlanModal
          open={grantOpen}
          userId={detail.user.id}
          overrides={detail.subscription.limit_overrides}
          onClose={() => setGrantOpen(false)}
          onGranted={(next) => {
            setDetail(next);
            setGrantOpen(false);
            onChanged();
          }}
        />
      ) : null}
    </Drawer>
  );
};
