import { Button, Card, Empty, Statistic, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

import type { SurveyDetail, SurveyResults } from '../../api/surveys.api';
import { DailyResponsesChart } from './SurveyCharts';
import { formatDateTime, formatDuration, formatNumber } from './surveyFormat';

export type SurveyTabKey = 'overview' | 'form' | 'responses' | 'analytics';

const COLLECTION_STATE: Record<SurveyDetail['status'], string> = {
  draft: 'Черновик: ссылка не работает',
  open: 'Принимает ответы',
  closed: 'Приём остановлен, ответы доступны для просмотра',
  archived: 'В архиве',
};

interface SurveyOverviewTabProps {
  survey: SurveyDetail;
  results: SurveyResults;
  onShare: () => void;
  onOpenTab: (tab: SurveyTabKey) => void;
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160 }}>
    <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>{label}</span>
    <strong style={{ fontSize: 14 }}>{value}</strong>
  </div>
);

/** "What is going on with the survey right now?" */
export const SurveyOverviewTab = ({ survey, results, onShare, onOpenTab }: SurveyOverviewTabProps) => {
  const hasResponses = results.total > 0;
  const days = results.responses_by_day;
  const canShare = survey.status !== 'archived';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Card size="small">
          <Statistic title="Всего отправок" value={results.total} />
        </Card>
        <Card size="small">
          <Statistic
            title={
              <span>
                Полнота ответов{' '}
                <Tooltip title="Средняя доля вопросов, на которые отвечал респондент">
                  <InfoCircleOutlined aria-label="Что такое полнота ответов" />
                </Tooltip>
              </span>
            }
            value={results.completion_rate === null ? 'Нет данных' : formatNumber(results.completion_rate)}
            suffix={results.completion_rate === null ? undefined : '%'}
          />
        </Card>
        <Card size="small">
          <Statistic
            title="Среднее время"
            value={results.mean_duration_seconds === null ? 'Нет данных' : formatDuration(results.mean_duration_seconds)}
          />
        </Card>
        <Card size="small">
          <Statistic
            title="Последний ответ"
            value={results.last_response_at ? formatDateTime(results.last_response_at) : 'Ответов пока нет'}
            styles={{ content: { fontSize: 18 } }}
          />
        </Card>
      </div>

      {hasResponses ? (
        <Card size="small" title="Динамика ответов">
          {days.length >= 2 ? (
            <DailyResponsesChart days={days} />
          ) : (
            <span style={{ color: 'var(--app-text-secondary)' }}>
              График появится, когда ответы придут минимум за два разных дня.
            </span>
          )}
        </Card>
      ) : (
        <Card size="small">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Ответов пока нет. Поделитесь ссылкой и пройдите опрос сами, чтобы проверить, как выглядит форма."
          >
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {canShare && (
                <Button type="primary" onClick={onShare}>
                  Поделиться
                </Button>
              )}
              <Button onClick={() => onOpenTab('form')}>Посмотреть форму</Button>
            </div>
          </Empty>
        </Card>
      )}

      <Card size="small" title="Об опросе">
        <p style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {survey.description?.trim() || (
            <span style={{ color: 'var(--app-text-secondary)' }}>Описание не добавлено.</span>
          )}
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Fact label="Сбор ответов" value={COLLECTION_STATE[survey.status]} />
          <Fact label="Первый ответ" value={results.first_response_at ? formatDateTime(results.first_response_at) : '—'} />
          <Fact label="Вопросов в форме" value={String(survey.questions_count)} />
        </div>
      </Card>

      {hasResponses && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="primary" onClick={() => onOpenTab('responses')}>
            Смотреть ответы
          </Button>
          <Button onClick={() => onOpenTab('analytics')}>Открыть аналитику</Button>
        </div>
      )}
    </div>
  );
};
