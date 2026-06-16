import { Timeline, Typography } from 'antd';
import { buildDisplayName } from '../../shared/utils/userName';
import type { RequestHistoryEventDTO } from '../../types/requestWorkflow';

const { Text } = Typography;

const EVENT_LABELS: Record<string, string> = {
  request_created: 'Заявка создана',
  request_updated: 'Заявка обновлена',
  request_status_changed: 'Статус заявки изменён',
  task_created: 'Подзадача создана',
  task_updated: 'Подзадача обновлена',
  task_status_changed: 'Статус подзадачи изменён',
  task_assignee_changed: 'Исполнитель подзадачи изменён',
  task_completed: 'Подзадача выполнена',
  request_completed: 'Заявка завершена',
  request_cancelled: 'Заявка отменена',
};

const formatPayload = (event: RequestHistoryEventDTO): string => {
  const p = event.payload ?? {};
  const parts: string[] = [];

  if (typeof p.old_status === 'string' && typeof p.new_status === 'string') {
    parts.push(`${p.old_status} → ${p.new_status}`);
  }
  if (typeof p.task_title === 'string') {
    parts.push(`«${p.task_title}»`);
  }
  if (typeof p.old_assignee_id === 'string' || typeof p.new_assignee_id === 'string') {
    parts.push(
      `исполнитель: ${p.old_assignee_id ? String(p.old_assignee_id) : '—'} → ${p.new_assignee_id ? String(p.new_assignee_id) : '—'}`,
    );
  }
  if (typeof p.comment === 'string' && p.comment) {
    parts.push(p.comment);
  }
  return parts.join(' · ');
};

interface Props {
  events: RequestHistoryEventDTO[];
}

export const RequestHistoryTimeline = ({ events }: Props) => {
  if (!events.length) {
    return <Text type="secondary">История изменений пока пуста.</Text>;
  }

  const sorted = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <Timeline
      items={sorted.map((event) => {
        const actorName = event.actor
          ? buildDisplayName({
              first_name: event.actor.first_name,
              last_name: event.actor.last_name,
              middle_name: event.actor.middle_name,
            })
          : 'Система';
        const detail = formatPayload(event);
        return {
          key: event.id,
          children: (
            <div>
              <Text strong>{EVENT_LABELS[event.type] ?? event.type}</Text>
              <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                {actorName} · {new Date(event.created_at).toLocaleString('ru-RU')}
              </div>
              {detail ? (
                <div style={{ fontSize: 13, marginTop: 4 }}>{detail}</div>
              ) : null}
            </div>
          ),
        };
      })}
    />
  );
};
