import { useState } from 'react';
import { Button, Modal, Tag, Tile } from '@carbon/react';
import { AiAnalysisPanel } from '../AiAnalysisPanel';
import type { Field } from '../../../types/form';
import type { AIRequestAnalysis } from '../../../types/request';
import { toQualityAnalysisViewModel } from './qualityAnalysisViewModel';

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
  const compactView = analysis ? toQualityAnalysisViewModel(analysis) : null;

  return (
    <>
      <Tile style={{ padding: 14 }}>
        <span style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
          Качество заявки
        </span>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--cds-text-secondary)', lineHeight: 1.45 }}>
          Оценка качества перед исполнением. Назначение исполнителя — только во вкладке «Исполнение».
        </p>

        {!compactView ? (
          <Button kind="primary" size="sm" disabled={running} onClick={onAnalyze}>
            {running ? 'Анализ…' : 'Запустить проверку'}
          </Button>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Tag type={compactView.badgeType} size="sm">
                {compactView.badgeText}
              </Tag>
            </div>
            {compactView.issues && compactView.issues.length > 0 ? (
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
                {compactView.issues.map((issue, idx) => (
                  <li key={`${issue}-${idx}`}>{issue}</li>
                ))}
                {compactView.hiddenIssuesCount > 0 ? (
                  <li style={{ fontStyle: 'italic' }}>… и ещё {compactView.hiddenIssuesCount}</li>
                ) : null}
              </ul>
            ) : (
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: 12,
                  color: 'var(--cds-text-secondary)',
                  lineHeight: 1.45,
                }}
              >
                {compactView.description}
              </p>
            )}

            {compactView.issues && compactView.issues.length > 0 ? (
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: 12,
                  color: 'var(--cds-text-secondary)',
                  lineHeight: 1.45,
                }}
              >
                {compactView.status === 'insufficient_data'
                  ? 'Исправьте замечания, чтобы заявку можно было передать в работу.'
                  : 'Есть некритичные замечания: заявку можно взять в работу, но лучше уточнить детали.'}
              </p>
            ) : null}
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
        modalHeading="Качество заявки"
        passiveModal
        size="md"
      >
        <AiAnalysisPanel analysis={analysis} fields={fields} running={running} onAnalyze={onAnalyze} />
      </Modal>
    </>
  );
}
