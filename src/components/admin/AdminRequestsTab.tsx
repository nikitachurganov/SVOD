import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Segmented, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  adminErrorText,
  approvePlanRequest,
  listPlanRequests,
  rejectPlanRequest,
} from '../../shared/api/admin.api';
import type { AdminPlanRequest, Paged, PlanRequestStatus } from '../../types/admin';
import {
  PLAN_TITLES,
  REQUEST_TERM_DAYS,
  REQUEST_TERM_LABELS,
  formatDateTime,
} from './adminLabels';

const PAGE_SIZE = 25;

type Filter = PlanRequestStatus | 'all';

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'Ждут решения' },
  { value: 'approved', label: 'Одобренные' },
  { value: 'rejected', label: 'Отклонённые' },
  { value: 'all', label: 'Все' },
];

const STATE_TAGS: Record<PlanRequestStatus, { label: string; color: string }> = {
  pending: { label: 'Ждёт решения', color: 'gold' },
  approved: { label: 'Одобрена', color: 'success' },
  rejected: { label: 'Отклонена', color: 'error' },
};

const muted = { color: 'var(--app-text-secondary)' } as const;

interface Props {
  onOpenUser: (userId: string) => void;
  /** A decision was made: the counters and the user table change */
  onDecided: () => void;
  refreshKey: number;
}

export const AdminRequestsTab = ({ onOpenUser, onDecided, refreshKey }: Props) => {
  const [filter, setFilter] = useState<Filter>('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AdminPlanRequest> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<AdminPlanRequest | null>(null);
  const [rejecting, setRejecting] = useState<AdminPlanRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [approveForm] = Form.useForm<{ days: number; note?: string }>();
  const [rejectForm] = Form.useForm<{ reason?: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await listPlanRequests({
          status: filter === 'all' ? undefined : filter,
          page,
          page_size: PAGE_SIZE,
        }),
      );
    } catch (err) {
      setError(adminErrorText(err, 'Не удалось загрузить заявки'));
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const startApprove = (request: AdminPlanRequest) => {
    approveForm.setFieldsValue({ days: REQUEST_TERM_DAYS[request.billing_interval] ?? 30, note: '' });
    setApproving(request);
  };

  const startReject = (request: AdminPlanRequest) => {
    rejectForm.setFieldsValue({ reason: '' });
    setRejecting(request);
  };

  const decide = async (action: () => Promise<unknown>, done: string, close: () => void) => {
    setSaving(true);
    try {
      await action();
      message.success(done);
      close();
      await load();
      onDecided();
    } catch (err) {
      message.error(adminErrorText(err, 'Не удалось сохранить решение'));
      // A request somebody else has already decided is stale on this screen
      void load();
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<AdminPlanRequest> = [
    {
      title: 'Пользователь',
      key: 'user',
      width: 230,
      render: (_, row) => (
        <Button type="link" style={{ padding: 0, height: 'auto', textAlign: 'left' }} onClick={() => onOpenUser(row.user_id)}>
          <div>
            <div>{row.user_name || row.user_email}</div>
            <div style={{ fontSize: 12, ...muted }}>{row.user_email}</div>
          </div>
        </Button>
      ),
    },
    {
      title: 'Тариф',
      key: 'plan',
      width: 190,
      render: (_, row) => (
        <div>
          <div>{PLAN_TITLES[row.plan_code] ?? row.plan_code}</div>
          <div style={{ fontSize: 12, ...muted }}>
            {REQUEST_TERM_LABELS[row.billing_interval] ?? row.billing_interval}
          </div>
        </div>
      ),
    },
    {
      title: 'Контакт и комментарий',
      key: 'contact',
      width: 260,
      render: (_, row) => (
        <div>
          <div>{row.contact}</div>
          {row.comment ? <div style={{ fontSize: 12, ...muted }}>{row.comment}</div> : null}
        </div>
      ),
    },
    {
      title: 'Отправлена',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'Статус',
      key: 'status',
      width: 190,
      render: (_, row) => (
        <div>
          <Tag color={STATE_TAGS[row.status].color}>{STATE_TAGS[row.status].label}</Tag>
          {row.processed_at ? (
            <div style={{ fontSize: 12, ...muted }}>{formatDateTime(row.processed_at)}</div>
          ) : null}
          {row.decision_note ? <div style={{ fontSize: 12, ...muted }}>{row.decision_note}</div> : null}
        </div>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      width: 210,
      fixed: 'right',
      render: (_, row) =>
        row.status === 'pending' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="primary" size="small" onClick={() => startApprove(row)}>
              Активировать
            </Button>
            <Button size="small" danger onClick={() => startReject(row)}>
              Отклонить
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <Card className="registry-page__card">
      <div className="admin-filters">
        <Segmented<Filter>
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
        />
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
        <Table<AdminPlanRequest>
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={loading}
          size="middle"
          scroll={{ x: 1100 }}
          locale={{ emptyText: filter === 'pending' ? 'Новых заявок нет' : 'Заявок нет' }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => `Всего: ${total}`,
            onChange: setPage,
          }}
        />
      )}

      <Modal
        open={!!approving}
        title="Активировать тариф"
        okText="Активировать"
        cancelText="Отмена"
        confirmLoading={saving}
        onCancel={() => setApproving(null)}
        onOk={async () => {
          if (!approving) return;
          const values = await approveForm.validateFields();
          await decide(
            () =>
              approvePlanRequest(approving.id, {
                days: values.days,
                note: values.note?.trim() || undefined,
              }),
            'Тариф подключён, человеку отправлено письмо',
            () => setApproving(null),
          );
        }}
        destroyOnHidden
      >
        <p style={{ marginTop: 0 }}>
          {approving?.user_name || approving?.user_email} · {approving ? REQUEST_TERM_LABELS[approving.billing_interval] : ''}
          <br />
          <span style={muted}>Подключайте после того, как оплата пришла.</span>
        </p>
        <Form form={approveForm} layout="vertical" requiredMark={false}>
          <Form.Item
            name="days"
            label="Срок, дней"
            extra="Если тариф уже действует, срок добавится к текущему."
            rules={[{ required: true, message: 'Укажите срок' }]}
          >
            <InputNumber min={1} max={3650} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Заметка в журнале">
            <Input.TextArea rows={2} maxLength={500} placeholder="Например: оплата по счёту №12" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!rejecting}
        title="Отклонить заявку"
        okText="Отклонить"
        cancelText="Отмена"
        okButtonProps={{ danger: true }}
        confirmLoading={saving}
        onCancel={() => setRejecting(null)}
        onOk={async () => {
          if (!rejecting) return;
          const values = await rejectForm.validateFields();
          await decide(
            () => rejectPlanRequest(rejecting.id, { reason: values.reason?.trim() || undefined }),
            'Заявка отклонена, человеку отправлено письмо',
            () => setRejecting(null),
          );
        }}
        destroyOnHidden
      >
        <Form form={rejectForm} layout="vertical" requiredMark={false}>
          <Form.Item name="reason" label="Причина (её увидит человек)">
            <Input.TextArea rows={3} maxLength={500} placeholder="Например: оплата не пришла" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
