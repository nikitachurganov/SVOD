import { Alert, Button, Card, Statistic, Tag } from 'antd';
import { ReloadOutlined, RobotOutlined } from '@ant-design/icons';

import type { SurveyAiSummary, SurveyResults } from '../../api/surveys.api';
import { MetricCard } from './MetricCard';
import { SegmentPieChart } from './SurveyCharts';
import { formatDateTime, formatDuration, formatNumber } from './surveyFormat';

const MAX_SEGMENT_OPTIONS = 8;
const MAX_SEGMENT_CHARTS = 4;

interface SurveyOverviewTabProps {
  results: SurveyResults;
  aiSummary: SurveyAiSummary | null;
  aiLoading: boolean;
  aiError: string | null;
  onGenerateAiSummary: (force: boolean) => void;
}

const AiSummaryCard = ({
  aiSummary,
  aiLoading,
  aiError,
  onGenerate,
}: {
  aiSummary: SurveyAiSummary | null;
  aiLoading: boolean;
  aiError: string | null;
  onGenerate: (force: boolean) => void;
}) => (
  <Card
    size="small"
    title={
      <span>
        <RobotOutlined style={{ color: 'var(--app-primary)', marginRight: 8 }} />
        AI-резюме
      </span>
    }
    extra={
      <Button
        size="small"
        icon={aiSummary ? <ReloadOutlined /> : <RobotOutlined />}
        loading={aiLoading}
        onClick={() => onGenerate(true)}
      >
        {aiSummary ? 'Обновить' : 'Сгенерировать'}
      </Button>
    }
  >
    {aiError && <Alert type="error" showIcon message={aiError} style={{ marginBottom: 8 }} />}
    {aiSummary ? (
      <>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {aiSummary.bullets.map((bullet, index) => (
            <li key={index} style={{ lineHeight: 1.5 }}>
              {bullet}
            </li>
          ))}
        </ul>
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontSize: 12,
            color: 'var(--app-text-secondary)',
          }}
        >
          <span>
            Сформировано {formatDateTime(aiSummary.generated_at)} по {aiSummary.responses_used}{' '}
            ответам. Резюме написано ИИ по агрегированным данным — проверяйте выводы.
          </span>
          {aiSummary.stale && (
            <Tag color="orange" style={{ margin: 0 }}>
              Появились новые ответы — обновите резюме
            </Tag>
          )}
        </div>
      </>
    ) : (
      !aiLoading && (
        <span style={{ color: 'var(--app-text-secondary)' }}>
          Нажмите «Сгенерировать», чтобы получить 3–5 главных выводов по результатам опроса.
        </span>
      )
    )}
  </Card>
);

export const SurveyOverviewTab = ({
  results,
  aiSummary,
  aiLoading,
  aiError,
  onGenerateAiSummary,
}: SurveyOverviewTabProps) => {
  // Segmentation questions: closed questions with few options that are not a methodology block
  const segments = results.questions
    .filter(
      (q) =>
        q.kind === 'choice' &&
        !q.methodology &&
        q.answered > 0 &&
        q.options.length >= 2 &&
        q.options.length <= MAX_SEGMENT_OPTIONS,
    )
    .slice(0, MAX_SEGMENT_CHARTS);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="Всего ответов" value={results.total} />
          <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
            В анализе: {results.used}
          </div>
        </Card>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic
            title="Полнота ответов"
            value={results.completion_rate === null ? '—' : formatNumber(results.completion_rate)}
            suffix={results.completion_rate === null ? undefined : '%'}
          />
          <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
            Доля вопросов, на которые отвечал респондент
          </div>
        </Card>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="Среднее время" value={formatDuration(results.mean_duration_seconds)} />
          <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
            Медиана: {formatDuration(results.median_duration_seconds)}
          </div>
        </Card>
      </div>

      <AiSummaryCard
        aiSummary={aiSummary}
        aiLoading={aiLoading}
        aiError={aiError}
        onGenerate={onGenerateAiSummary}
      />

      {results.metrics.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {results.metrics.map((metric) => (
            <MetricCard key={metric.id} metric={metric} />
          ))}
        </div>
      )}

      {segments.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Демография и сегменты</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {segments.map((q) => (
              <Card key={q.field_id} size="small" title={q.label} style={{ flex: '1 1 320px' }}>
                <SegmentPieChart options={q.options} />
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
