import { useCallback, useEffect, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Tag, Tile } from '@carbon/react';
import { getRequestPerformers } from '../../../shared/api/requests.api';
import type { PerformerRecommendationResponse } from '../../../types/performerSelection';

const STATUS_HEADLINE: Record<string, string> = {
  strong_match: 'Совпадение высокое',
  partial_match: 'С ограничениями',
  no_match: 'Кандидат не найден',
};

export type PerformerHintAssistantProps = {
  requestId: string;
  organizationId: string | null | undefined;
  onGoToExecution: () => void;
};

export function PerformerHintAssistant({
  requestId,
  organizationId,
  onGoToExecution,
}: PerformerHintAssistantProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reco, setReco] = useState<PerformerRecommendationResponse | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setReco(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getRequestPerformers(requestId);
      setReco(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить рекомендацию.');
      setReco(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId, requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!organizationId) {
    return (
      <Tile style={{ padding: 14 }}>
        <span style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Подсказка по исполнителю</span>
        <span style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
          Укажите организацию у заявки.
        </span>
      </Tile>
    );
  }

  const recommended = reco?.recommended_performer_id
    ? reco.performers.find((p) => p.id === reco.recommended_performer_id)
    : reco?.performers[0];

  return (
    <Tile style={{ padding: 14 }}>
      <span style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
        Рекомендация исполнителя
      </span>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--cds-text-secondary)', lineHeight: 1.45 }}>
        Только подсказка. Назначение и передача задачи выполняются во вкладке «Исполнение».
      </p>

      {loading && (
        <div style={{ padding: '8px 0' }}>
          <InlineLoading description="Загрузка…" />
        </div>
      )}

      {error && (
        <InlineNotification kind="warning" title="" subtitle={error} lowContrast hideCloseButton />
      )}

      {!loading && reco && (
        <>
          <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--cds-text-secondary)' }}>
            {STATUS_HEADLINE[reco.status] ?? reco.status}
            {reco.confidence != null ? ` · уверенность ${reco.confidence}%` : ''}
          </div>
          {recommended ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{recommended.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                {recommended.position}
                {recommended.organization ? ` · ${recommended.organization}` : ''}
              </div>
              {reco.recommended_performer_id === recommended.id ? (
                <div style={{ marginTop: 6 }}>
                  <Tag type="green" size="sm">
                    Рекомендуемый
                  </Tag>
                </div>
              ) : null}
            </div>
          ) : (
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              Подходящих кандидатов в списке нет — подберите вручную во вкладке «Исполнение».
            </p>
          )}
          <Button kind="primary" size="sm" onClick={onGoToExecution}>
            Перейти к назначению
          </Button>
        </>
      )}
    </Tile>
  );
}
