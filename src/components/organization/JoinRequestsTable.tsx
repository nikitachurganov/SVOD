import { useState } from 'react';
import { Button, Form, Input, Modal, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { approveJoinRequest, rejectJoinRequest } from '../../shared/api/organizations.api';
import { buildDisplayName } from '../../shared/utils/userName';
import type { JoinRequestResponse } from '../../types/organization';

interface Props {
  requests: JoinRequestResponse[];
  loading: boolean;
  /** Called after the owner approved or rejected a request */
  onDecided: (requestId: string, approved: boolean) => void;
}

const apiErrorText = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Owner: pending requests to join by the link — approve (with editable profile) or reject */
export const JoinRequestsTable = ({ requests, loading, onDecided }: Props) => {
  const [approving, setApproving] = useState<JoinRequestResponse | null>(null);
  const [rejecting, setRejecting] = useState<JoinRequestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [approveForm] = Form.useForm<{ job_title?: string; specialization?: string }>();
  const [rejectReason, setRejectReason] = useState('');

  const openApprove = (row: JoinRequestResponse) => {
    approveForm.setFieldsValue({
      job_title: row.job_title ?? undefined,
      specialization: row.specialization ?? undefined,
    });
    setApproving(row);
  };

  const submitApprove = async (values: { job_title?: string; specialization?: string }) => {
    if (!approving) return;
    setBusy(true);
    try {
      await approveJoinRequest(approving.id, {
        job_title: values.job_title?.trim() || null,
        specialization: values.specialization?.trim() || null,
      });
      message.success(`${approving.user ? buildDisplayName(approving.user) : 'Участник'} теперь в организации`);
      onDecided(approving.id, true);
      setApproving(null);
    } catch (err) {
      message.error(apiErrorText(err, 'Не удалось принять заявку'));
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    if (!rejecting) return;
    setBusy(true);
    try {
      await rejectJoinRequest(rejecting.id, rejectReason);
      message.success('Заявка отклонена');
      onDecided(rejecting.id, false);
      setRejecting(null);
      setRejectReason('');
    } catch (err) {
      message.error(apiErrorText(err, 'Не удалось отклонить заявку'));
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<JoinRequestResponse> = [
    {
      title: 'Кто просится',
      key: 'user',
      render: (_, row) => (
        <div>
          <div>{row.user ? buildDisplayName(row.user) : '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
            {[row.user?.email, row.phone_number].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    {
      title: 'О себе',
      key: 'about',
      render: (_, row) => (
        <div style={{ maxWidth: 360 }}>
          {row.job_title ? <div>{row.job_title}</div> : null}
          {row.specialization ? (
            <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>{row.specialization}</div>
          ) : null}
          {row.message ? (
            <div style={{ fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>«{row.message}»</div>
          ) : null}
          {!row.job_title && !row.specialization && !row.message ? (
            <span style={{ color: 'var(--app-text-secondary)' }}>—</span>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Подана',
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      render: (value: string) => formatDate(value),
    },
    {
      title: 'Решение',
      key: 'actions',
      width: 230,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => openApprove(row)}>
            Принять
          </Button>
          <Button size="small" danger icon={<CloseOutlined />} onClick={() => setRejecting(row)}>
            Отклонить
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Table<JoinRequestResponse>
        rowKey="id"
        columns={columns}
        dataSource={requests}
        loading={loading}
        locale={{ emptyText: 'Новых заявок нет. Поделитесь ссылкой через «Добавить» → «Пригласить по ссылке».' }}
        pagination={false}
        size="middle"
      />

      <Modal
        open={!!approving}
        title={`Принять ${approving?.user ? buildDisplayName(approving.user) : ''}?`}
        okText="Принять в организацию"
        cancelText="Отмена"
        confirmLoading={busy}
        onOk={() => approveForm.submit()}
        onCancel={() => !busy && setApproving(null)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          При необходимости поправьте должность и специализацию — они учитываются при подборе исполнителей.
        </Typography.Paragraph>
        <Form form={approveForm} layout="vertical" onFinish={(v) => void submitApprove(v)}>
          <Form.Item name="job_title" label="Должность">
            <Input maxLength={300} />
          </Form.Item>
          <Form.Item name="specialization" label="Специализация">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!rejecting}
        title="Отклонить заявку?"
        okText="Отклонить"
        cancelText="Отмена"
        okButtonProps={{ danger: true }}
        confirmLoading={busy}
        onOk={() => void submitReject()}
        onCancel={() => !busy && setRejecting(null)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          Человек увидит причину и сможет подать заявку снова.
        </Typography.Paragraph>
        <Input.TextArea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Причина (необязательно)"
          autoSize={{ minRows: 2, maxRows: 5 }}
          maxLength={2000}
        />
      </Modal>
    </>
  );
};
