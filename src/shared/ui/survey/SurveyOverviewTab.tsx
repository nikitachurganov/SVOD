import { Button, Card, Empty, Statistic, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

import type { SurveyDetail, SurveyResults } from '../../api/surveys.api';
import { DailyResponsesChart } from './SurveyCharts';
import { formatDateTime, formatDuration, formatNumber } from './surveyFormat';

export type SurveyTabKey = 'overview' | 'form' | 'responses' | 'analytics';

/** Compact tiles: six of them fit in a row */
const STAT_STYLES = { title: { fontSize: 13, marginBottom: 2 }, content: { fontSize: 18 } };

interface SurveyOverviewTabProps {
  survey: SurveyDetail;
  results: SurveyResults;
  onShare: () => void;
  onOpenTab: (tab: SurveyTabKey) => void;
}

/** "What is going on with the survey right now?" */
export const SurveyOverviewTab = ({ survey, results, onShare, onOpenTab }: SurveyOverviewTabProps) => {
  const hasResponses = results.total > 0;
  const days = results.responses_by_day;
  const canShare = survey.status !== 'archived';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
          <Statistic title="Всего отправок" value={results.total} styles={STAT_STYLES} />
        </Card>
        <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
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
            styles={STAT_STYLES}
          />
        </Card>
        <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
          <Statistic
            title="Среднее время"
            value={results.mean_duration_seconds === null ? 'Нет данных' : formatDuration(results.mean_duration_seconds)}
            styles={STAT_STYLES}
          />
        </Card>
        <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
          <Statistic
            title="Последний ответ"
            value={results.last_response_at ? formatDateTime(results.last_response_at) : 'Ответов пока нет'}
            styles={STAT_STYLES}
          />
        </Card>
        <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
          <Statistic
            title="Первый ответ"
            value={results.first_response_at ? formatDateTime(results.first_response_at) : 'Ответов пока нет'}
            styles={STAT_STYLES}
          />
        </Card>
        <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
          <Statistic title="Вопросов в форме" value={survey.questions_count} styles={STAT_STYLES} />
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
