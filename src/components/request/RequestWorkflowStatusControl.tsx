import { useMemo } from 'react';
import { Alert, Button, Modal, Select, Space, Tag, Typography } from 'antd';
import type { WorkflowStatus } from '../../types/requestWorkflow';
import {
  WORKFLOW_STATUS_COLORS,
  WORKFLOW_STATUS_LABELS,
} from '../../types/requestWorkflow';
import { patchWorkflowStatus } from '../../shared/api/requests.api';

const { Text } = Typography;

const TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  draft: ['new'],
  new: ['triage', 'waiting_info', 'cancelled'],
  triage: ['in_progress', 'waiting_info', 'cancelled'],
  in_progress: ['review', 'waiting_info', 'cancelled'],
  review: ['completed', 'cancelled'],
  waiting_info: ['triage', 'in_progress'],
  completed: ['archived', 'triage'],
  cancelled: ['archived'],
  archived: [],
};

interface Props {
  requestId: string;
  currentStatus: WorkflowStatus | string;
  canManage: boolean;
  onUpdated: () => void;
  suggestion?: { suggested_status: WorkflowStatus; reason: string } | null;
}

export const RequestWorkflowStatusControl = ({
  requestId,
  currentStatus,
  canManage,
  onUpdated,
  suggestion,
}: Props) => {
  const status = (currentStatus as WorkflowStatus) || 'new';
  const nextOptions = useMemo(() => TRANSITIONS[status] ?? [], [status]);

  const handleChange = async (next: WorkflowStatus) => {
    const apply = async (forceComplete = false) => {
      try {
        await patchWorkflowStatus(requestId, {
          status: next,
          force_complete: forceComplete,
        });
        onUpdated();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось сменить статус';
        if (next === 'completed' && message.includes('обязательные')) {
          Modal.confirm({
            title: 'Есть незавершённые обязательные подзадачи',
            content: 'Всё равно завершить заявку?',
            okText: 'Завершить',
            cancelText: 'Отмена',
            onOk: () => apply(true),
          });
          return;
        }
        Modal.error({ title: 'Ошибка', content: message });
      }
    };

    if (next === 'completed') {
      Modal.confirm({
        title: 'Завершить заявку?',
        content: 'Заявка будет переведена в статус «Завершена».',
        okText: 'Завершить',
        cancelText: 'Отмена',
        onOk: () => apply(false),
      });
      return;
    }

    await apply();
  };

  const applySuggestion = async () => {
    if (!suggestion) return;
    await patchWorkflowStatus(requestId, { status: suggestion.suggested_status });
    onUpdated();
  };

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Text type="secondary">Статус заявки:</Text>
        <Tag color={WORKFLOW_STATUS_COLORS[status] ?? 'default'}>
          {WORKFLOW_STATUS_LABELS[status] ?? status}
        </Tag>
        {canManage && nextOptions.length > 0 && (
          <Select<WorkflowStatus>
            placeholder="Сменить статус"
            style={{ minWidth: 200 }}
            value={undefined}
            onChange={(value) => void handleChange(value)}
            options={nextOptions.map((s) => ({
              value: s,
              label: WORKFLOW_STATUS_LABELS[s],
            }))}
          />
        )}
      </Space>
      {suggestion && canManage && suggestion.suggested_status !== status && (
        <Alert
          type="info"
          showIcon
          message={suggestion.reason}
          action={
            <Button size="small" type="primary" onClick={() => void applySuggestion()}>
              Перевести в «{WORKFLOW_STATUS_LABELS[suggestion.suggested_status]}»
            </Button>
          }
        />
      )}
    </Space>
  );
};
