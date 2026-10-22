import { Alert, Button, Card, Tag } from 'antd';
import { ReloadOutlined, RobotOutlined } from '@ant-design/icons';

import type { SurveyAiSummary, SurveyResults } from '../../api/surveys.api';
import { MetricCard } from './MetricCard';
import { SegmentPieChart } from './SurveyCharts';
import { SurveyQuantTab } from './SurveyQuantTab';
import { formatDateTime } from './surveyFormat';

const MAX_SEGMENT_OPTIONS = 8;
const MAX_SEGMENT_CHARTS = 4;

interface AiSummaryCardProps {
  aiSummary: SurveyAiSummary | null;
  aiLoading: boolean;
  aiError: string | null;
  onGenerate: (force: boolean) => void;
  /** question id -> its text, for the "see the data" links under every conclusion */
  questionLabels: Map<string, string>;
}

const showQuestion = (id: string) =>
  document.getElementById(`question-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const AiSummaryCard = ({ aiSummary, aiLoading, aiError, onGenerate, questionLabels }: AiSummaryCardProps) => (
  <Card
    size="small"
    title={
      <span>
        <RobotOutlined style={{ color: 'var(--app-primary)', marginRight: 8 }} />
        ИИ-резюме
      </span>
    }
    extra={
      <Button
        size="small"
        icon={aiSummary ? <ReloadOutlined /> : <RobotOutlined />}
        loading={aiLoading}
        onClick={() => onGenerate(true)}
      >
        {aiSummary ? 'Обновить' : 'Сформировать ИИ-резюме'}
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
              {(aiSummary.evidence[index] ?? []).length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>Данные:</span>
                  {(aiSummary.evidence[index] ?? []).map((id) => (
                    <Button
                      key={id}
                      type="link"
                      size="small"
                      style={{ padding: 0, height: 'auto', fontSize: 12 }}
                      onClick={() => showQuestion(id)}
                    >
                      {questionLabels.get(id) ?? id}
                    </Button>
                  ))}
                </div>
              )}
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
            ответам. Резюме написано ИИ по агрегированным данным и не заменяет их — проверяйте
            выводы по графикам и таблицам ниже.
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
          Нажмите «Сформировать ИИ-резюме», чтобы получить 3–5 главных выводов по результатам.
        </span>
      )
    )}
  </Card>
);

interface SurveyAnalyticsTabProps {
  surveyId: string;
  results: SurveyResults;
  excludeFlagged: boolean;
  aiSummary: SurveyAiSummary | null;
  aiLoading: boolean;
  aiError: string | null;
  onGenerateAiSummary: (force: boolean) => void;
  onOpenResponse: (responseId: string) => void;
}

export const SurveyAnalyticsTab = ({
  surveyId,
  results,
  excludeFlagged,
  aiSummary,
  aiLoading,
  aiError,
  onGenerateAiSummary,
  onOpenResponse,
}: SurveyAnalyticsTabProps) => {
  const questionLabels = new Map(results.questions.map((q) => [q.field_id, q.label]));
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
      <div style={{ fontSize: 13, color: 'var(--app-text-secondary)' }}>
        В расчёт включено ответов: {results.used} из {results.total}
        {excludeFlagged && results.excluded > 0 && ` (исключено по замечаниям качества: ${results.excluded})`}.
      </div>

      {results.used === 0 ? (
        <Alert
          type="info"
          showIcon
          message="Нет ответов для анализа"
          description="Все полученные ответы исключены по замечаниям качества. Отключите фильтр, чтобы увидеть их в расчётах."
        />
      ) : (
        <>
          <AiSummaryCard
            aiSummary={aiSummary}
            aiLoading={aiLoading}
            aiError={aiError}
            onGenerate={onGenerateAiSummary}
            questionLabels={questionLabels}
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
              <div className="survey-chart-grid">
                {segments.map((q) => (
                  <Card
                    key={q.field_id}
                    size="small"
                    title={<span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{q.label}</span>}
                    style={{ minWidth: 0 }}
                  >
                    <SegmentPieChart options={q.options} />
                  </Card>
                ))}
              </div>
            </div>
          )}

          <SurveyQuantTab
            surveyId={surveyId}
            results={results}
            excludeFlagged={excludeFlagged}
            onOpenResponse={onOpenResponse}
          />
        </>
      )}
    </div>
  );
};
