import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react';
import {
  addRequestStage,
  blockRequestStage,
  completeRequestStage,
  getRequestPerformers,
  unblockRequestStage,
} from '../../shared/api/requests.api';
import type { RequestExecutionEventDTO, RequestStageDTO } from '../../types/execution';
import type { PerformerRecommendationResponse, RecommendedPerformerDTO } from '../../types/performerSelection';
import { AssignPerformerModal } from './AssignPerformerModal';

const TERMINAL = new Set(['done', 'cancelled']);

const EXEC_LABELS: Record<string, string> = {
  new: 'Не начато',
  in_progress: 'В работе',
  waiting: 'Ожидание',
  blocked: 'Блокировка',
  completed: 'Завершено',
};

const STAGE_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  waiting_assignment: 'Нужен исполнитель',
  waiting_external: 'Внешнее ожидание',
  in_progress: 'В работе',
  needs_review: 'На проверке',
  blocked: 'Блокировка',
  done: 'Готово',
  cancelled: 'Отменено',
};

export type RequestExecutionPanelProps = {
  requestId: string;
  organizationId: string | null;
  executionStatus: string | null | undefined;
  stages: RequestStageDTO[];
  executionEvents: RequestExecutionEventDTO[];
  requestClosed: boolean;
  onReload: () => Promise<void>;
};

function activeStage(stages: RequestStageDTO[]): RequestStageDTO | null {
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
  return sorted.find((s) => !TERMINAL.has(s.status)) ?? null;
}

export function RequestExecutionPanel({
  requestId,
  organizationId,
  executionStatus,
  stages,
  executionEvents,
  requestClosed,
  onReload,
}: RequestExecutionPanelProps) {
  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState<string | null>(null);
  const [reco, setReco] = useState<PerformerRecommendationResponse | null>(null);
  const [selectedPerformerId, setSelectedPerformerId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeNote, setCompleteNote] = useState('');

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.sequence - b.sequence),
    [stages],
  );
  const cur = useMemo(() => activeStage(sortedStages), [sortedStages]);

  const loadReco = useCallback(async () => {
    if (!organizationId) return;
    setRecoLoading(true);
    setRecoError(null);
    try {
      const data = await getRequestPerformers(requestId);
      setReco(data);
      const initial =
        data.recommended_performer_id ??
        (data.performers[0] ? data.performers[0].id : null);
      setSelectedPerformerId(initial);
    } catch (e) {
      setRecoError(e instanceof Error ? e.message : 'Не удалось загрузить подбор.');
      setReco(null);
    } finally {
      setRecoLoading(false);
    }
  }, [organizationId, requestId]);

  useEffect(() => {
    void loadReco();
  }, [loadReco]);

  const selectedPerformer: RecommendedPerformerDTO | null =
    reco?.performers.find((p) => p.id === selectedPerformerId) ?? null;

  const handleAddStage = async () => {
    const title = addTitle.trim();
    if (!title) return;
    setBusy(true);
    setErr(null);
    try {
      await addRequestStage(requestId, { title });
      setAddTitle('');
      setAddOpen(false);
      await onReload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось добавить этап.');
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!cur) return;
    setBusy(true);
    setErr(null);
    try {
      await completeRequestStage(requestId, cur.id, {
        result_summary: completeNote.trim() || undefined,
      });
      setCompleteNote('');
      setCompleteOpen(false);
      await onReload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось завершить этап.');
    } finally {
      setBusy(false);
    }
  };

  const handleBlock = async () => {
    if (!cur) return;
    const reason = blockReason.trim();
    if (!reason) return;
    setBusy(true);
    setErr(null);
    try {
      await blockRequestStage(requestId, cur.id, { reason });
      setBlockReason('');
      setBlockOpen(false);
      await onReload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось заблокировать.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnblock = async () => {
    if (!cur) return;
    setBusy(true);
    setErr(null);
    try {
      await unblockRequestStage(requestId, cur.id);
      await onReload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось снять блокировку.');
    } finally {
      setBusy(false);
    }
  };

  if (!organizationId) {
    return (
      <InlineNotification
        kind="info"
        title="Исполнение недоступно"
        subtitle="У заявки не указана организация."
        lowContrast
        hideCloseButton
      />
    );
  }

  const execLabel = executionStatus ? EXEC_LABELS[executionStatus] ?? executionStatus : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Tile style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600 }}>
              Ход исполнения
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--cds-text-secondary)' }}>Сводный статус</span>
              <Tag type={executionStatus === 'completed' ? 'green' : 'blue'}>{execLabel}</Tag>
              {sortedStages.length > 0 && (
                <span style={{ fontSize: 13, color: 'var(--cds-text-secondary)' }}>
                  Этапов: {sortedStages.length}
                  {cur ? ` · текущий: «${cur.title}»` : ''}
                </span>
              )}
            </div>
          </div>
          <Button kind="tertiary" size="sm" disabled={requestClosed || busy} onClick={() => setAddOpen(true)}>
            Добавить этап
          </Button>
        </div>

        {err && (
          <InlineNotification
            kind="error"
            title="Ошибка"
            subtitle={err}
            lowContrast
            hideCloseButton
            style={{ marginTop: 12 }}
          />
        )}

        {sortedStages.length === 0 ? (
          <p style={{ margin: '16px 0 0', fontSize: 14, color: 'var(--cds-text-secondary)' }}>
            Этапы не добавлены. Добавьте этап или назначьте исполнителя из вкладки «Информация» — будет
            создан этап по умолчанию.
          </p>
        ) : (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedStages.map((s) => {
              const isCurrent = cur?.id === s.id;
              const label = STAGE_LABELS[s.status] ?? s.status;
              return (
                <div
                  key={s.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 4,
                    border: isCurrent
                      ? '2px solid var(--cds-focus)'
                      : '1px solid var(--cds-border-subtle)',
                    background: 'var(--cds-layer-01)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {s.sequence}. {s.title}
                        {isCurrent ? (
                          <span style={{ marginLeft: 8, display: 'inline-block' }}>
                            <Tag type="blue" size="sm">
                              Текущий
                            </Tag>
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--cds-text-secondary)', marginTop: 4 }}>
                        <Tag size="sm">{label}</Tag>
                        {s.assignee_preview?.full_name ? (
                          <span style={{ marginLeft: 8 }}>{s.assignee_preview.full_name}</span>
                        ) : (
                          <span style={{ marginLeft: 8 }}>Исполнитель не назначен</span>
                        )}
                      </div>
                      {s.blocked_reason ? (
                        <div style={{ fontSize: 13, marginTop: 6, color: 'var(--cds-text-error)' }}>
                          {s.blocked_reason}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Tile>

      {cur && !requestClosed ? (
        <Tile style={{ padding: 16 }}>
          <span style={{ display: 'block', fontWeight: 600, marginBottom: 12 }}>
            Текущий этап
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button
              kind="primary"
              size="sm"
              disabled={busy || recoLoading || cur.status === 'blocked'}
              onClick={() => setAssignOpen(true)}
            >
              Назначить / передать
            </Button>
            <Button
              kind="secondary"
              size="sm"
              disabled={busy || cur.status === 'blocked'}
              onClick={() => setCompleteOpen(true)}
            >
              Завершить этап
            </Button>
            {cur.status === 'blocked' ? (
              <Button kind="tertiary" size="sm" disabled={busy} onClick={() => void handleUnblock()}>
                Снять блокировку
              </Button>
            ) : (
              <Button kind="danger--tertiary" size="sm" disabled={busy} onClick={() => setBlockOpen(true)}>
                Заблокировать
              </Button>
            )}
          </div>

          {recoLoading && (
            <div style={{ marginTop: 12 }}>
              <InlineLoading description="Подбор исполнителей…" />
            </div>
          )}
          {recoError && (
            <InlineNotification
              kind="warning"
              title="Подбор"
              subtitle={recoError}
              lowContrast
              hideCloseButton
              style={{ marginTop: 12 }}
            />
          )}
          {!recoLoading && reco && reco.performers.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--cds-text-secondary)' }}>
              Выберите исполнителя для передачи и нажмите «Назначить / передать».
            </div>
          )}
        </Tile>
      ) : null}

      <Tile style={{ padding: 16 }}>
        <span style={{ display: 'block', fontWeight: 600, marginBottom: 12 }}>
          Журнал передач
        </span>
        {executionEvents.length === 0 ? (
          <span style={{ fontSize: 14, color: 'var(--cds-text-secondary)' }}>Событий пока нет.</span>
        ) : (
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 14,
            }}
          >
            {executionEvents.slice(0, 20).map((ev) => (
              <li key={ev.id}>
                <strong>{ev.event_type}</strong>
                <span style={{ color: 'var(--cds-text-secondary)', marginLeft: 8 }}>
                  {formatDateTime(ev.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      <AssignPerformerModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        requestId={requestId}
        stageId={cur?.id ?? null}
        performer={selectedPerformer}
        recommendedPerformerId={reco?.recommended_performer_id ?? null}
        onSuccess={onReload}
      />

      <Modal
        open={addOpen}
        onRequestClose={() => !busy && setAddOpen(false)}
        modalHeading="Новый этап"
        primaryButtonText={busy ? 'Сохранение…' : 'Добавить'}
        secondaryButtonText="Отмена"
        primaryButtonDisabled={busy || !addTitle.trim()}
        onRequestSubmit={(e) => {
          e.preventDefault();
          void handleAddStage();
        }}
        size="sm"
      >
        <TextInput
          id="new-stage-title"
          labelText="Название этапа"
          value={addTitle}
          onChange={(ev) => setAddTitle(ev.target.value)}
        />
      </Modal>

      <Modal
        open={completeOpen}
        onRequestClose={() => !busy && setCompleteOpen(false)}
        modalHeading="Завершить этап"
        primaryButtonText={busy ? 'Сохранение…' : 'Завершить'}
        secondaryButtonText="Отмена"
        primaryButtonDisabled={busy}
        onRequestSubmit={(e) => {
          e.preventDefault();
          void handleComplete();
        }}
      >
        <TextArea
          labelText="Результат / примечание для передачи (необязательно)"
          value={completeNote}
          onChange={(ev) => setCompleteNote(ev.target.value)}
        />
      </Modal>

      <Modal
        open={blockOpen}
        onRequestClose={() => !busy && setBlockOpen(false)}
        modalHeading="Заблокировать этап"
        primaryButtonText={busy ? 'Сохранение…' : 'Заблокировать'}
        secondaryButtonText="Отмена"
        primaryButtonDisabled={busy || !blockReason.trim()}
        onRequestSubmit={(e) => {
          e.preventDefault();
          void handleBlock();
        }}
      >
        <TextArea
          labelText="Причина"
          value={blockReason}
          onChange={(ev) => setBlockReason(ev.target.value)}
        />
      </Modal>
    </div>
  );
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
