import { useState } from 'react';
import { DatePicker, Progress, Select, Tag, Tooltip, message } from 'antd';
import dayjs from 'dayjs';
import type { RequestEntity } from '../../types/request';
import {
  TASK_PRIORITY_COLORS,
  TASK_PRIORITY_LABELS,
  WORKFLOW_STATUS_COLORS,
  WORKFLOW_STATUS_LABELS,
  type TaskPriority,
} from '../../types/requestWorkflow';
import { updateRequestAttributes } from '../../shared/api/requests.api';
import { buildDisplayName } from '../../shared/utils/userName';
import { RequestResponsibilityControl } from './RequestResponsibilityControl';

type Props = {
  request: RequestEntity;
  onUpdated: () => Promise<void>;
};

const PRIORITY_OPTIONS = (Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((value) => ({
  value,
  label: TASK_PRIORITY_LABELS[value],
}));

/** Latest stage deadline — shown as a hint when the request has no own due date */
const latestStageDueDate = (request: RequestEntity): string | null => {
  const dates = (request.stages ?? [])
    .filter((stage) => stage.status !== 'cancelled' && stage.due_date)
    .map((stage) => stage.due_date as string);
  if (!dates.length) return null;
  return dates.reduce((max, current) => (dayjs(current).isAfter(max) ? current : max));
};

export function RequestPassport({ request, onUpdated }: Props) {
  const [saving, setSaving] = useState(false);
  const permissions = request.permissions;
  const canEdit = Boolean(permissions?.can_edit_attributes);
  const status = String(request.workflow_status ?? 'new');
  const priority = (request.priority ?? 'medium') as TaskPriority;
  const progress = request.progress ?? { completed: 0, total: 0 };
  const stageDueDate = latestStageDueDate(request);

  const save = async (payload: Parameters<typeof updateRequestAttributes>[1]) => {
    setSaving(true);
    try {
      await updateRequestAttributes(request.id, payload);
      await onUpdated();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dl className="request-passport">
      <div className="request-passport__item">
        <dt>Статус</dt>
        <dd>
          <Tag color={WORKFLOW_STATUS_COLORS[status] ?? 'default'} style={{ marginInlineEnd: 0 }}>
            {WORKFLOW_STATUS_LABELS[status] ?? status}
          </Tag>
        </dd>
      </div>

      <div className="request-passport__item">
        <dt>Ответственный</dt>
        <dd>
          <span className={request.responsible_user ? undefined : 'request-passport__muted'}>
            {request.responsible_user ? buildDisplayName(request.responsible_user) : 'Не назначен'}
          </span>
          <RequestResponsibilityControl
            requestId={request.id}
            organizationId={request.organization_id}
            responsible={request.responsible_user}
            canAssign={Boolean(permissions?.can_assign_responsible)}
            onUpdated={onUpdated}
            buttonOnly
          />
        </dd>
      </div>

      <div className="request-passport__item">
        <dt>Приоритет</dt>
        <dd>
          {canEdit ? (
            <Select
              size="small"
              variant="borderless"
              value={priority}
              options={PRIORITY_OPTIONS}
              disabled={saving}
              onChange={(value) => void save({ priority: value })}
              popupMatchSelectWidth={false}
              style={{ minWidth: 110, marginInlineStart: -8 }}
            />
          ) : (
            <Tag color={TASK_PRIORITY_COLORS[priority] ?? 'default'} style={{ marginInlineEnd: 0 }}>
              {TASK_PRIORITY_LABELS[priority] ?? priority}
            </Tag>
          )}
        </dd>
      </div>

      <div className="request-passport__item">
        <dt>Срок</dt>
        <dd>
          {canEdit ? (
            <DatePicker
              size="small"
              variant="borderless"
              format="DD.MM.YYYY"
              value={request.due_date ? dayjs(request.due_date) : null}
              placeholder={stageDueDate ? `${dayjs(stageDueDate).format('DD.MM.YYYY')} по этапам` : 'Не задан'}
              disabled={saving}
              onChange={(value) =>
                void save({ due_date: value ? value.endOf('day').toISOString() : null })
              }
              style={{ marginInlineStart: -8, width: 170 }}
            />
          ) : request.due_date ? (
            dayjs(request.due_date).format('DD.MM.YYYY')
          ) : stageDueDate ? (
            <Tooltip title="Рассчитано по срокам этапов">
              <span>{dayjs(stageDueDate).format('DD.MM.YYYY')}</span>
            </Tooltip>
          ) : (
            <span className="request-passport__muted">Не задан</span>
          )}
        </dd>
      </div>

      <div className="request-passport__item">
        <dt>Прогресс</dt>
        <dd>
          {progress.total > 0 ? (
            <Tooltip title={`Выполнено этапов: ${progress.completed} из ${progress.total}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
                <Progress
                  percent={Math.round((progress.completed / progress.total) * 100)}
                  size="small"
                  showInfo={false}
                  style={{ margin: 0, width: 80 }}
                />
                <span>
                  {progress.completed}/{progress.total}
                </span>
              </div>
            </Tooltip>
          ) : (
            <span className="request-passport__muted">Этапов нет</span>
          )}
        </dd>
      </div>
    </dl>
  );
}
