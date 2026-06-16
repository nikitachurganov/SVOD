import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { getMembers } from '../../shared/api/organizations.api';
import {
  cancelRequestTask,
  createRequestTask,
  getWorkflowSuggestion,
  patchRequestTaskAssignee,
  patchRequestTaskStatus,
  updateRequestTask,
} from '../../shared/api/requests.api';
import { buildDisplayName } from '../../shared/utils/userName';
import type { MemberResponse } from '../../types/organization';
import type {
  RequestTaskDTO,
  TaskPriority,
  TaskStatus,
  WorkflowStatus,
} from '../../types/requestWorkflow';
import {
  TASK_PRIORITY_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_COLORS,
  TASK_STATUS_LABELS,
} from '../../types/requestWorkflow';
import { RequestWorkflowStatusControl } from './RequestWorkflowStatusControl';

const { TextArea } = Input;

interface TaskFormValues {
  title: string;
  description?: string;
  status: TaskStatus;
  assignee_id?: string | null;
  priority: TaskPriority;
  due_date?: dayjs.Dayjs | null;
  is_required: boolean;
}

interface Props {
  requestId: string;
  organizationId: string | null | undefined;
  tasks: RequestTaskDTO[];
  workflowStatus: string;
  canManage: boolean;
  currentUserId: string | null;
  onReload: () => void;
}

const memberLabel = (member: MemberResponse): string => {
  const name = buildDisplayName(member.user);
  const role = member.role_tag ? ` (${member.role_tag})` : '';
  const email = member.user.email ? ` — ${member.user.email}` : '';
  return `${name}${role}${email}`;
};

export const RequestTasksPanel = ({
  requestId,
  organizationId,
  tasks,
  workflowStatus,
  canManage,
  currentUserId,
  onReload,
}: Props) => {
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<RequestTaskDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    suggested_status: WorkflowStatus;
    reason: string;
  } | null>(null);
  const [form] = Form.useForm<TaskFormValues>();

  const loadMembers = useCallback(async () => {
    if (!organizationId) return;
    setMembersLoading(true);
    try {
      const data = await getMembers(organizationId);
      setMembers(data);
    } catch {
      message.error('Не удалось загрузить участников организации');
    } finally {
      setMembersLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const refreshSuggestion = useCallback(async () => {
    try {
      const data = await getWorkflowSuggestion(requestId);
      setSuggestion(data);
    } catch {
      setSuggestion(null);
    }
  }, [requestId]);

  useEffect(() => {
    void refreshSuggestion();
  }, [refreshSuggestion, tasks.length]);

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.user.id,
        label: memberLabel(m),
      })),
    [members],
  );

  const openCreate = () => {
    setEditingTask(null);
    form.setFieldsValue({
      title: '',
      description: '',
      status: 'todo',
      assignee_id: null,
      priority: 'medium',
      due_date: null,
      is_required: false,
    });
    setModalOpen(true);
  };

  const openEdit = (task: RequestTaskDTO) => {
    setEditingTask(task);
    form.setFieldsValue({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      assignee_id: task.assignee_id ?? null,
      priority: task.priority,
      due_date: task.due_date ? dayjs(task.due_date) : null,
      is_required: task.is_required,
    });
    setModalOpen(true);
  };

  const handleSave = async (values: TaskFormValues) => {
    setSaving(true);
    try {
      const payload = {
        title: values.title.trim(),
        description: values.description?.trim() || null,
        status: values.status,
        assignee_id: values.assignee_id ?? null,
        priority: values.priority,
        due_date: values.due_date ? values.due_date.toISOString() : null,
        is_required: values.is_required,
      };

      if (editingTask) {
        await updateRequestTask(requestId, editingTask.id, payload);
        message.success('Подзадача обновлена');
      } else {
        await createRequestTask(requestId, payload);
        message.success('Подзадача создана');
      }
      setModalOpen(false);
      onReload();
      void refreshSuggestion();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Не удалось сохранить подзадачу');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (task: RequestTaskDTO, status: TaskStatus) => {
    try {
      await patchRequestTaskStatus(requestId, task.id, status);
      message.success('Статус обновлён');
      onReload();
      void refreshSuggestion();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Не удалось сменить статус');
    }
  };

  const handleAssigneeChange = async (task: RequestTaskDTO, assigneeId: string | null) => {
    if (!canManage) return;
    try {
      await patchRequestTaskAssignee(requestId, task.id, assigneeId);
      message.success('Исполнитель назначен');
      onReload();
      void refreshSuggestion();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Не удалось назначить исполнителя');
    }
  };

  const handleCancelTask = (task: RequestTaskDTO) => {
    Modal.confirm({
      title: 'Отменить подзадачу?',
      content: `Подзадача «${task.title}» будет отменена.`,
      okText: 'Отменить подзадачу',
      cancelText: 'Назад',
      okButtonProps: { danger: true },
      onOk: async () => {
        await cancelRequestTask(requestId, task.id);
        message.success('Подзадача отменена');
        onReload();
      },
    });
  };

  const canEditTask = (task: RequestTaskDTO): boolean => {
    if (canManage) return task.status !== 'cancelled';
    return task.assignee_id === currentUserId && task.status !== 'cancelled';
  };

  const columns: ColumnsType<RequestTaskDTO> = [
    {
      title: 'Название',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{title}</div>
          {record.is_required && (
            <Tag color="volcano" style={{ marginTop: 4 }}>
              Обязательная
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: TaskStatus, record) =>
        canEditTask(record) ? (
          <Select
            size="small"
            value={status}
            style={{ width: '100%' }}
            onChange={(value) => void handleStatusChange(record, value as TaskStatus)}
            options={Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        ) : (
          <Tag color={TASK_STATUS_COLORS[status]}>{TASK_STATUS_LABELS[status]}</Tag>
        ),
    },
    {
      title: 'Исполнитель',
      key: 'assignee',
      width: 220,
      render: (_, record) =>
        canManage ? (
          <Select
            allowClear
            showSearch
            size="small"
            placeholder="Не назначен"
            style={{ width: '100%' }}
            loading={membersLoading}
            value={record.assignee_id ?? undefined}
            options={memberOptions}
            optionFilterProp="label"
            onChange={(value) => void handleAssigneeChange(record, value ?? null)}
          />
        ) : (
          <span>
            {record.assignee
              ? buildDisplayName({
                  first_name: record.assignee.first_name,
                  last_name: record.assignee.last_name,
                  middle_name: record.assignee.middle_name,
                })
              : '—'}
          </span>
        ),
    },
    {
      title: 'Приоритет',
      dataIndex: 'priority',
      key: 'priority',
      width: 110,
      render: (priority: TaskPriority) => (
        <Tag color={TASK_PRIORITY_COLORS[priority]}>{TASK_PRIORITY_LABELS[priority]}</Tag>
      ),
    },
    {
      title: 'Дедлайн',
      dataIndex: 'due_date',
      key: 'due_date',
      width: 110,
      render: (value: string | null | undefined) =>
        value ? new Date(value).toLocaleDateString('ru-RU') : '—',
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          {canManage && (
            <Button type="link" size="small" onClick={() => openEdit(record)}>
              Изменить
            </Button>
          )}
          {canManage && record.status !== 'cancelled' && (
            <Button type="link" size="small" danger onClick={() => handleCancelTask(record)}>
              Отменить
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '1rem 0 1.5rem' }}>
      <RequestWorkflowStatusControl
        requestId={requestId}
        currentStatus={workflowStatus}
        canManage={canManage}
        onUpdated={onReload}
        suggestion={suggestion}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '16px 0 12px',
        }}
      >
        <span style={{ fontWeight: 600 }}>Подзадачи</span>
        {canManage && (
          <Button type="primary" onClick={openCreate} disabled={!organizationId}>
            Добавить подзадачу
          </Button>
        )}
      </div>

      {membersLoading && tasks.length === 0 ? (
        <Spin />
      ) : tasks.length === 0 ? (
        <Empty description="Подзадач пока нет" />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={tasks}
          pagination={false}
          size="small"
        />
      )}

      <Modal
        open={modalOpen}
        title={editingTask ? 'Редактировать подзадачу' : 'Новая подзадача'}
        okText={saving ? 'Сохранение…' : 'Сохранить'}
        cancelText="Отмена"
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => void handleSave(v)}>
          <Form.Item
            name="title"
            label="Название"
            rules={[
              { required: true, message: 'Введите название' },
              { min: 3, message: 'Минимум 3 символа' },
            ]}
          >
            <Input placeholder="Название подзадачи" maxLength={500} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <TextArea rows={3} placeholder="Описание (необязательно)" maxLength={5000} />
          </Form.Item>
          <Form.Item name="status" label="Статус" rules={[{ required: true }]}>
            <Select
              options={Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item name="assignee_id" label="Исполнитель">
            <Select
              allowClear
              showSearch
              placeholder="Выберите участника организации"
              loading={membersLoading}
              options={memberOptions}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="priority" label="Приоритет" rules={[{ required: true }]}>
            <Select
              options={Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item name="due_date" label="Дедлайн">
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item name="is_required" valuePropName="checked">
            <Checkbox>Обязательная подзадача</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
