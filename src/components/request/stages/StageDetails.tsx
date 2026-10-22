import { Button, Collapse, Skeleton } from 'antd';
import {
  CheckOutlined,
  EditOutlined,
  FileTextOutlined,
  LinkOutlined,
  UnlockOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getStageArtifactDownloadUrl } from '../../../shared/api/requests.api';
import type {
  RequestStageArtifactDTO,
  RequestStageDTO,
  RequestTimelineStageDTO,
} from '../../../types/execution';
import type { RequestPermissions } from '../../../types/request';
import { StageAssigneeLabel } from '../StageAssigneeLabel';

const dateTime = (value?: string | null): string =>
  value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function ArtifactList({
  requestId,
  stageId,
  rows,
  empty,
}: {
  requestId: string;
  stageId: string;
  rows: RequestStageArtifactDTO[];
  empty: string;
}) {
  if (!rows.length) return <p className="stage-muted">{empty}</p>;
  return (
    <ul className="stage-files">
      {rows.map((artifact) => (
        <li key={artifact.id}>
          <Button
            type="link"
            size="small"
            icon={artifact.kind === 'link' ? <LinkOutlined /> : <FileTextOutlined />}
            onClick={() => {
              if (artifact.kind === 'link' && artifact.url) {
                window.open(artifact.url, '_blank', 'noopener,noreferrer');
                return;
              }
              const popup = window.open('', '_blank');
              void getStageArtifactDownloadUrl(requestId, stageId, artifact.id)
                .then((url) => {
                  if (popup) popup.location.href = url;
                })
                .catch(() => popup?.close());
            }}
          >
            {artifact.name}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export type StageDetailsProps = {
  requestId: string;
  stage: RequestStageDTO;
  /** Full dossier (spec, handoffs, files, events); undefined while loading */
  dossier?: RequestTimelineStageDTO;
  isActive: boolean;
  requestStarted: boolean;
  permissions?: RequestPermissions;
  onAssign: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onUnblock: () => void;
};

/** Expanded body of a stage in the stages tab */
export function StageDetails({
  requestId,
  stage,
  dossier,
  isActive,
  requestStarted,
  permissions,
  onAssign,
  onEdit,
  onComplete,
  onUnblock,
}: StageDetailsProps) {
  const done = stage.status === 'done';
  const blocked = stage.status === 'blocked';
  const canManage = Boolean(permissions?.can_manage_plan);
  const showActions = isActive && requestStarted && !done;
  // Assign/edit stay available for any not-yet-finished stage, not only the active one
  const canEditStage = canManage && !done;

  const date = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : null);
  const overdue = Boolean(stage.is_overdue && !done);

  const properties: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Исполнитель', value: <StageAssigneeLabel assignee={stage.assignee_preview} /> },
    { label: 'Роль', value: stage.recommended_role || '—' },
    { label: 'Дата начала', value: date(stage.started_at) ?? '—' },
    {
      label: 'Дата сдачи',
      value: stage.due_date ? (
        <span className={overdue ? 'stage-overdue' : undefined}>
          {date(stage.due_date)}
          {overdue ? ' · просрочен' : ''}
        </span>
      ) : (
        '—'
      ),
    },
  ];
  if (stage.completed_at) properties.push({ label: 'Дата завершения', value: date(stage.completed_at) });

  return (
    <div className="stage-details">
      {stage.description ? <p className="stage-details__description">{stage.description}</p> : null}

      <dl className="stage-props">
        {properties.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      {blocked && stage.blocked_reason ? (
        <div className="stage-callout stage-callout--danger" role="status">
          <span>Причина блокировки</span>
          <p>{stage.blocked_reason}</p>
        </div>
      ) : null}

      {!dossier ? (
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      ) : (
        <>
          {done ? (
            <section className="stage-section">
              <h4>Результат</h4>
              {dossier.result_summary ? <p className="stage-result">{dossier.result_summary}</p> : null}
              <ArtifactList
                requestId={requestId}
                stageId={stage.id}
                rows={dossier.result_artifacts}
                empty={dossier.result_summary ? '' : 'Результат без файлов и ссылок'}
              />
            </section>
          ) : null}

          <Collapse
            ghost
            size="small"
            className="stage-more"
            items={[
              {
                key: 'events',
                label: `История этапа · ${dossier.events.length}`,
                children: dossier.events.length ? (
                  <ul className="stage-log">
                    {dossier.events.map((event) => (
                      <li key={event.id}>
                        <strong>{event.actor_name ?? 'Система'}</strong>
                        <span>
                          {event.message ?? event.event_type} · {dateTime(event.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="stage-muted">Событий пока нет.</p>
                ),
              },
            ]}
          />
        </>
      )}

      {showActions || canEditStage ? (
        <div className="stage-actions">
          {showActions && permissions?.can_complete_active_stage && !blocked ? (
            <Button type="primary" icon={<CheckOutlined />} onClick={onComplete}>
              Завершить этап
            </Button>
          ) : null}
          {showActions && permissions?.can_unblock_active_stage && blocked ? (
            <Button type="primary" icon={<UnlockOutlined />} onClick={onUnblock}>
              Снять блокировку
            </Button>
          ) : null}
          {canEditStage ? (
            <Button icon={<UserSwitchOutlined />} onClick={onAssign}>
              {stage.assignee_preview ? 'Сменить исполнителя' : 'Назначить исполнителя'}
            </Button>
          ) : null}
          {canEditStage ? (
            <Button className="stage-actions__edit" icon={<EditOutlined />} onClick={onEdit}>
              Редактировать
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
