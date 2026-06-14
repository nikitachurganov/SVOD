import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Spin, Tag } from 'antd';
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
    <Card styles={{ body: { padding: 16 } }}>
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
            <p style={{ margin: 0, fontSize: 13, color: 'var(--app-text-secondary)' }}>
              Статус: {STATUS_HEADLINE[reco.status]} · Уверенность: {reco.confidence}%
            </p>
          )}
        </div>
        <Button type="primary" disabled={!selected || loading} onClick={openAssign}>
          Передать задачу
        </Button>
      </div>

      {assignedPerformerId && (
        <Alert
          type="info"
          message="Исполнитель уже назначен"
          description={`Идентификатор: ${assignedPerformerId}`}
          showIcon
          closable={false}
          style={{ marginBottom: 12 }}
        />
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spin tip="Загрузка подбора…" />
        </div>
      )}

      {error && (
        <Alert
          type="error"
          message="Не удалось загрузить данные"
          description={error}
          showIcon
          closable={false}
        />
      )}

      {!loading && reco && reco.performers.length === 0 && (
        <div style={{ marginTop: 8 }}>
          <Alert
            type="warning"
            message="Не удалось подобрать исполнителя"
            description={`Роль: ${reco.fallback.required_role}. Где искать: ${reco.fallback.recommended_sources.join(', ')}. География: ${reco.fallback.geography}.`}
            showIcon
            closable={false}
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
            <Card
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
              styles={{
                body: {
                  padding: 12,
                  cursor: 'pointer',
                  outline: 'none',
                  border:
                    selectedId === p.id
                      ? '2px solid var(--app-focus)'
                      : '1px solid var(--app-border)',
                },
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <strong style={{ fontSize: 14 }}>{p.full_name}</strong>
                  {reco.recommended_performer_id === p.id && (
                    <Tag color="success">Рекомендуемый</Tag>
                  )}
                  {p.active_tasks > 8 && <Tag color="error">Перегружен</Tag>}
                  {!p.contact_available && <Tag color="default">Нет контакта</Tag>}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--app-text-secondary)',
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
                      color: 'var(--app-text-error)',
                    }}
                  >
                    {p.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
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
    </Card>
  );
}
