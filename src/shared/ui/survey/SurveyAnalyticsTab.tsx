import { AiModelSelect } from './AiModelSelect';
import type { ReactNode } from 'react';
import { Alert, Button, Card, Tag } from 'antd';
import { ReloadOutlined, RobotOutlined } from '../materialIcons';

import type { SurveyAiSummary, SurveyResults } from '../../api/surveys.api';
import { AiQuotaNote } from '../../../components/billing/AiQuotaNote';
import { useSubscription } from '../../hooks/subscription.hooks';
import { getAiQuota } from '../../lib/aiQuota';
import { AnalyticsCard } from './AnalyticsCard';
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
  onOpenQuestion?: (id: string) => void;
  readOnly?: boolean;
}

/** The button is switched off once the plan's AI actions are used up: the server would refuse it anyway */
const GenerateSummaryButton = ({
  hasSummary,
  loading,
  onGenerate,
}: {
  hasSummary: boolean;
  loading: boolean;
  onGenerate: (force: boolean) => void;
}) => {
  const { subscription, team } = useSubscription();
  return (
    <Button
      size="small"
      data-tour="ai-summary"
      icon={hasSummary ? <ReloadOutlined /> : <RobotOutlined />}
      loading={loading}
      disabled={getAiQuota(subscription, team).exhausted}
      onClick={() => onGenerate(true)}
    >
      {hasSummary ? 'Обновить' : 'Сформировать ИИ-резюме'}
    </Button>
  );
};

const showQuestion = (id: string) =>
  document.getElementById(`question-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const AiSummaryCard = ({ aiSummary, aiLoading, aiError, onGenerate, questionLabels, onOpenQuestion, readOnly }: AiSummaryCardProps) => (
  <Card
    size="small"
    title={
      <span>
        <RobotOutlined style={{ color: 'var(--app-primary)', marginRight: 8 }} />
        ИИ-резюме
      </span>
    }
    extra={readOnly ? undefined : <GenerateSummaryButton hasSummary={!!aiSummary} loading={aiLoading} onGenerate={onGenerate} />}
  >
    {aiError && <Alert type="error" showIcon message={aiError} style={{ marginBottom: 8 }} />}
    <AiQuotaNote className="ai-quota-note--card" />
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
                      onClick={() => onOpenQuestion ? onOpenQuestion(id) : showQuestion(id)}
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
  view?: 'questions' | 'insights';
  onOpenQuestion?: (id: string) => void;
  readOnly?: boolean;
  surveyId: string;
  results: SurveyResults;
  excludeFlagged: boolean;
  aiSummary: SurveyAiSummary | null;
  aiLoading: boolean;
  aiError: string | null;
  onGenerateAiSummary: (force: boolean) => void;
  onOpenResponse: (responseId: string) => void;
  /** The switch that decides whether answers with serious remarks are counted */
  qualityControl: ReactNode;
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
  qualityControl,
  view = 'questions',
  onOpenQuestion,
  readOnly = false,
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
    <div className="survey-analytics">
      <div className="survey-basis">
        <div>
          <div className="survey-basis__main">
            В расчёт включено ответов: <strong>{results.used}</strong> из {results.total}
          </div>
          <div className="survey-basis__note">
            {!excludeFlagged
              ? 'Показаны все ответы, в том числе с серьёзными замечаниями'
              : results.excluded > 0
                ? `Исключено по замечаниям качества: ${results.excluded}`
                : 'Ответов с серьёзными замечаниями нет'}
          </div>
        </div>
        {qualityControl}
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
          {view === 'insights' && <>
          {!readOnly && <AiModelSelect />}
          <Alert type="info" showIcon message="Выводы требуют проверки" description={`В расчёте ${results.used} ответов. Выборка может быть нерепрезентативной; наблюдения ИИ не доказывают причинно-следственную связь. Открывайте основания каждого вывода.`} />
          {aiSummary && aiSummary.exclude_flagged !== excludeFlagged && <Alert type="warning" showIcon message="Инсайты рассчитаны с другим фильтром качества" description="Обновите ИИ-резюме, чтобы его основания соответствовали текущему набору ответов." />}
          {readOnly ? (aiSummary ? <AiSummaryCard readOnly aiSummary={aiSummary} aiLoading={false} aiError={null} onGenerate={() => {}} questionLabels={questionLabels} onOpenQuestion={onOpenQuestion} /> : <p>ИИ-инсайты ещё не сформированы. Это может сделать редактор исследования.</p>) : <AiSummaryCard
            aiSummary={aiSummary}
            aiLoading={aiLoading}
            aiError={aiError}
            onGenerate={onGenerateAiSummary}
            questionLabels={questionLabels}
            onOpenQuestion={onOpenQuestion}
          />}
          </>}

          {view === 'questions' && <>

          {results.metrics.length > 0 && (
            <div>
              <h3 className="survey-section-title">Метрики</h3>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {results.metrics.map((metric) => (
                  <MetricCard key={metric.id} metric={metric} />
                ))}
              </div>
            </div>
          )}

          {segments.length > 0 && (
            <div>
              <h3 className="survey-section-title">Демография и сегменты</h3>
              <div className="survey-chart-grid">
                {segments.map((q) => (
                  <AnalyticsCard
                    key={q.field_id}
                    title={q.label}
                    meta={
                      <span>
                        Ответили: <strong>{q.answered}</strong> из{' '}
                        {Math.min(q.shown ?? results.used, results.used)}
                      </span>
                    }
                  >
                    <SegmentPieChart options={q.options} />
                  </AnalyticsCard>
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
          </>}
        </>
      )}
    </div>
  );
};
