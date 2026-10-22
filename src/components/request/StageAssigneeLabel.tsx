import { Tag, Tooltip } from 'antd';
import type { StageAssigneePreview } from '../../types/execution';
import { CONTACT_KIND_LABELS } from '../organization/participants.utils';

const contactHref = (kind: string | null | undefined, value: string): string | null => {
  const digits = value.replace(/[^\d+]/g, '');
  switch (kind) {
    case 'phone':
      return `tel:${digits}`;
    case 'email':
      return `mailto:${value}`;
    case 'telegram':
      return `https://t.me/${value.replace(/^@/, '')}`;
    case 'whatsapp':
      return `https://wa.me/${digits.replace(/^\+/, '')}`;
    default:
      return null;
  }
};

/** Stage assignee: name; for an external contractor — a tag and how to reach them */
export function StageAssigneeLabel({ assignee }: { assignee?: StageAssigneePreview | null }) {
  if (!assignee) return <span>Исполнитель не назначен</span>;
  if (assignee.kind !== 'external') return <span>{assignee.full_name}</span>;

  const contact = assignee.contact_value?.trim();
  const href = contact ? contactHref(assignee.contact_kind, contact) : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span>{assignee.full_name}</span>
      <Tooltip title="Внешний исполнитель без доступа к сервису. Этап отмечает выполненным ответственный.">
        <Tag color="gold" style={{ marginInlineEnd: 0 }}>
          Подрядчик
        </Tag>
      </Tooltip>
      {assignee.organization ? <span>{assignee.organization}</span> : null}
      {contact ? (
        <span>
          {CONTACT_KIND_LABELS[assignee.contact_kind ?? ''] ?? 'Контакт'}:{' '}
          {href ? (
            <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
              {contact}
            </a>
          ) : (
            contact
          )}
        </span>
      ) : null}
    </span>
  );
}
