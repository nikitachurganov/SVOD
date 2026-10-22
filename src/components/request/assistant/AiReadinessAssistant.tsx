import { useState } from 'react';
import { Alert, Button, Card, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { AIRequestAnalysis } from '../../../types/request';
import { toQualityAnalysisViewModel } from './qualityAnalysisViewModel';
import { generateRequestAnalysis, getAIJob } from '../../../shared/api/requests.api';

const badgeColor = (type: 'green' | 'red'): string => (type === 'green' ? 'success' : 'error');

export type AiReadinessAssistantProps = {
  analysis: AIRequestAnalysis | null | undefined;
  requestId: string;
  status?: string | null;
  canGenerate: boolean;
  onUpdated: () => Promise<void>;
};

export function AiReadinessAssistant({
  analysis,
  requestId,
  status,
  canGenerate,
  onUpdated,
}: AiReadinessAssistantProps) {
  const compactView = analysis ? toQualityAnalysisViewModel(analysis) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await generateRequestAnalysis(requestId);
      for (let attempt = 0; attempt < 45; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const job = await getAIJob(created.id);
        if (job.status === 'succeeded') {
          await onUpdated();
          return;
        }
        if (job.status === 'failed') throw new Error(job.error || 'AI-анализ завершился ошибкой');
      }
      throw new Error('Анализ выполняется дольше обычного. Результат появится автоматически.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось запустить AI-анализ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card styles={{ body: { padding: 14 } }}>
      <span style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
        Качество заявки
      </span>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--app-text-secondary)', lineHeight: 1.45 }}>
        Оценка качества перед исполнением. Назначение исполнителя — только во вкладке «Этапы».
      </p>
      {status === 'queued' || status === 'running' || busy ? (
        <Tag color="processing">Анализ выполняется в фоне</Tag>
      ) : null}
      {status === 'failed' ? <Alert type="warning" showIcon message="AI-анализ временно недоступен" /> : null}
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 8 }} /> : null}

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
      {canGenerate ? (
        <Button
          type="link"
          size="small"
          icon={<ReloadOutlined />}
          loading={busy}
          onClick={() => void regenerate()}
          style={{ paddingInline: 0, marginTop: 8 }}
        >
          {analysis ? 'Перезапустить анализ' : 'Запустить анализ'}
        </Button>
      ) : null}
    </Card>
  );
}
