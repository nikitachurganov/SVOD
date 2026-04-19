import { useState } from 'react';
import { Button, Modal, Tag, Tile } from '@carbon/react';
import { AiAnalysisPanel } from '../AiAnalysisPanel';
import type { Field } from '../../../types/form';
import type { AIRequestAnalysis } from '../../../types/request';

const STATUS_LABELS: Record<string, string> = {
  ready: 'Готова к обработке',
  needs_clarification: 'Нужны уточнения',
  not_ready: 'Не готова к обработке',
};

const statusTagType = (s: string): 'green' | 'blue' | 'red' | 'warm-gray' => {
  if (s === 'ready') return 'green';
  if (s === 'not_ready') return 'red';
  return 'warm-gray';
};

export type AiReadinessAssistantProps = {
  analysis: AIRequestAnalysis | null | undefined;
  fields: Field[];
  running: boolean;
  onAnalyze: () => void;
};

export function AiReadinessAssistant({
  analysis,
  fields,
  running,
  onAnalyze,
}: AiReadinessAssistantProps) {
  const [fullOpen, setFullOpen] = useState(false);

  return (
    <>
      <Tile style={{ padding: 14 }}>
        <span style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
          Готовность заявки
        </span>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--cds-text-secondary)', lineHeight: 1.45 }}>
          Оценка качества перед исполнением. Назначение исполнителя — только во вкладке «Исполнение».
        </p>

        {!analysis ? (
          <Button kind="primary" size="sm" disabled={running} onClick={onAnalyze}>
            {running ? 'Анализ…' : 'Запустить проверку'}
          </Button>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Tag type={statusTagType(analysis.status ?? 'needs_clarification')} size="sm">
                {STATUS_LABELS[analysis.status ?? 'needs_clarification'] ?? analysis.status}
              </Tag>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {analysis.completeness_score ?? 0} / 100
              </span>
              {analysis.ready_for_processing ? (
                <Tag type="green" size="sm">
                  Можно в работу
                </Tag>
              ) : (
                <Tag type="warm-gray" size="sm">
                  Есть замечания
                </Tag>
              )}
            </div>
            <div
              role="progressbar"
              aria-valuenow={analysis.completeness_score ?? 0}
              style={{
                height: 6,
                borderRadius: 3,
                background: 'var(--cds-border-subtle)',
                overflow: 'hidden',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.max(0, analysis.completeness_score ?? 0))}%`,
                  background: 'var(--cds-interactive)',
                }}
              />
            </div>
            {analysis.issues.length > 0 ? (
              <ul
                style={{
                  margin: '0 0 10px',
                  paddingLeft: 16,
                  fontSize: 12,
                  color: 'var(--cds-text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {analysis.issues.slice(0, 3).map((issue, idx) => (
                  <li key={`${issue.field}-${idx}`}>{issue.message}</li>
                ))}
                {analysis.issues.length > 3 ? (
                  <li style={{ fontStyle: 'italic' }}>… и ещё {analysis.issues.length - 3}</li>
                ) : null}
              </ul>
            ) : (
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--cds-text-secondary)' }}>
                Критичных замечаний нет.
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button kind="tertiary" size="sm" onClick={() => setFullOpen(true)}>
                Полный отчёт
              </Button>
              <Button kind="ghost" size="sm" disabled={running} onClick={onAnalyze}>
                {running ? 'Обновление…' : 'Обновить'}
              </Button>
            </div>
          </>
        )}
      </Tile>

      <Modal
        open={fullOpen}
        onRequestClose={() => setFullOpen(false)}
        modalHeading="Проверка качества заявки"
        passiveModal
        size="md"
      >
        <AiAnalysisPanel analysis={analysis} fields={fields} running={running} onAnalyze={onAnalyze} />
      </Modal>
    </>
  );
}
