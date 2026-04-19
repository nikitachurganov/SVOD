import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  InlineLoading,
  InlineNotification,
  Tag,
  Tile,
} from '@carbon/react';
import { getRequestPerformers } from '../../shared/api/requests.api';
import type {
  PerformerRecommendationResponse,
  RecommendedPerformerDTO,
  RecommendationStatus,
} from '../../types/performerSelection';
import { AssignPerformerModal } from './AssignPerformerModal';

const STATUS_HEADLINE: Record<RecommendationStatus, string> = {
  strong_match: 'Исполнитель найден',
  partial_match: 'Найден с ограничениями',
  no_match: 'Не найден',
};

export type PerformerSelectionBlockProps = {
  requestId: string;
  onReload: () => Promise<void>;
  assignedPerformerId?: string | null;
};

export function PerformerSelectionBlock({
  requestId,
  onReload,
  assignedPerformerId,
}: PerformerSelectionBlockProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reco, setReco] = useState<PerformerRecommendationResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRequestPerformers(requestId);
      setReco(data);
      const initial =
        data.recommended_performer_id ??
        (data.performers[0] ? data.performers[0].id : null);
      setSelectedId(initial);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Не удалось загрузить подбор исполнителей.',
      );
      setReco(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected: RecommendedPerformerDTO | null =
    reco?.performers.find((p) => p.id === selectedId) ?? null;

  const openAssign = () => {
    if (selected) setModalOpen(true);
  };

  return (
    <Tile style={{ padding: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div>
          <h4 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 600 }}>
            Подбор исполнителя
          </h4>
          {reco && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--cds-text-secondary)' }}>
              Статус: {STATUS_HEADLINE[reco.status]} · Уверенность: {reco.confidence}%
            </p>
          )}
        </div>
        <Button kind="primary" disabled={!selected || loading} onClick={openAssign}>
          Передать задачу
        </Button>
      </div>

      {assignedPerformerId && (
        <InlineNotification
          kind="info"
          title="Исполнитель уже назначен"
          subtitle={`Идентификатор: ${assignedPerformerId}`}
          lowContrast
          hideCloseButton
          style={{ marginBottom: 12 }}
        />
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <InlineLoading description="Загрузка подбора…" />
        </div>
      )}

      {error && (
        <InlineNotification
          kind="error"
          title="Не удалось загрузить данные"
          subtitle={error}
          lowContrast
          hideCloseButton
        />
      )}

      {!loading && reco && reco.performers.length === 0 && (
        <div style={{ marginTop: 8 }}>
          <InlineNotification
            kind="warning"
            title="Не удалось подобрать исполнителя"
            subtitle={`Роль: ${reco.fallback.required_role}. Где искать: ${reco.fallback.recommended_sources.join(', ')}. География: ${reco.fallback.geography}.`}
            lowContrast
            hideCloseButton
          />
        </div>
      )}

      {!loading && reco && reco.performers.length > 0 && (
        <div
          role="radiogroup"
          aria-label="Рекомендуемые исполнители"
          style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}
        >
          {reco.performers.map((p) => (
            <Tile
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedId(p.id);
                }
              }}
              style={{
                padding: 12,
                cursor: 'pointer',
                outline: 'none',
                border:
                  selectedId === p.id
                    ? '2px solid var(--cds-focus)'
                    : '1px solid var(--cds-border-subtle)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <strong style={{ fontSize: 14 }}>{p.full_name}</strong>
                  {reco.recommended_performer_id === p.id && (
                    <Tag type="green">Рекомендуемый</Tag>
                  )}
                  {p.active_tasks > 8 && <Tag type="red">Перегружен</Tag>}
                  {!p.contact_available && <Tag type="warm-gray">Нет контакта</Tag>}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--cds-text-secondary)',
                    marginTop: 4,
                  }}
                >
                  {p.position}
                  {p.organization ? ` · ${p.organization}` : ''}
                </div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  Задач активных: <strong>{p.active_tasks}</strong> · Балл: <strong>{p.score}</strong>
                </div>
                {p.reasons.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    {p.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {p.warnings.length > 0 && (
                  <ul
                    style={{
                      margin: '8px 0 0',
                      paddingLeft: 18,
                      fontSize: 13,
                      color: 'var(--cds-text-error)',
                    }}
                  >
                    {p.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Tile>
          ))}
        </div>
      )}

      <AssignPerformerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        requestId={requestId}
        performer={selected}
        recommendedPerformerId={reco?.recommended_performer_id ?? null}
        onSuccess={onReload}
      />
    </Tile>
  );
}
