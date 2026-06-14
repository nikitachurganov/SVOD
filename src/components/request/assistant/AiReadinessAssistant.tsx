import { Card, Tag } from 'antd';
import type { AIRequestAnalysis } from '../../../types/request';
import { toQualityAnalysisViewModel } from './qualityAnalysisViewModel';

const badgeColor = (type: 'green' | 'red'): string => (type === 'green' ? 'success' : 'error');

export type AiReadinessAssistantProps = {
  analysis: AIRequestAnalysis | null | undefined;
};

export function AiReadinessAssistant({
  analysis,
}: AiReadinessAssistantProps) {
  const compactView = analysis ? toQualityAnalysisViewModel(analysis) : null;

  return (
    <Card styles={{ body: { padding: 14 } }}>
      <span style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
        Качество заявки
      </span>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--app-text-secondary)', lineHeight: 1.45 }}>
        Оценка качества перед исполнением. Назначение исполнителя — только во вкладке «Исполнение».
      </p>

      {!compactView ? (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            lineHeight: 1.45,
          }}
        >
          Анализ пока не сформирован.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Tag color={badgeColor(compactView.badgeType)}>{compactView.badgeText}</Tag>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--app-text-secondary)',
              lineHeight: 1.45,
            }}
          >
            {compactView.description}
          </p>
        </>
      )}
    </Card>
  );
}
