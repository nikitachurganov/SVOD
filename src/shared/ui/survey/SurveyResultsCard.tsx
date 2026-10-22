import { Card, Empty, Progress, Spin, Statistic, Switch, Tag, Typography } from 'antd';

import type { MetricResult, QuestionStat, SurveyResults } from '../../api/surveys.api';

const { Text } = Typography;

const formatNumber = (value: number): string =>
  value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} мин ${s} с` : `${s} с`;
};

const MetricCard = ({ metric }: { metric: MetricResult }) => (
  <Card size="small" style={{ minWidth: 240, flex: '1 1 240px' }}>
    <Statistic
      title={metric.name}
      value={formatNumber(metric.value)}
      suffix={<span style={{ fontSize: 12 }}>{metric.unit}</span>}
    />
    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--app-text-secondary)' }}>
      Ответов в расчёте: {metric.n}
    </div>
    {Object.keys(metric.details).length > 0 && (
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
        {Object.entries(metric.details).map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{label}</span>
            <strong>{formatNumber(value)}</strong>
          </div>
        ))}
      </div>
    )}
    {metric.interpretation && (
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--app-text-secondary)' }}>
        {metric.interpretation}
      </div>
    )}
  </Card>
);

const QuestionBlock = ({ question }: { question: QuestionStat }) => {
  const maxCount = Math.max(1, ...question.distribution.map((b) => b.count));
  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--app-border, #f0f0f0)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>{question.label}</strong>
        <Text type="secondary" style={{ fontSize: 12 }}>
          ответов: {question.answered}
        </Text>
      </div>

      {question.answered === 0 && (
        <div style={{ fontSize: 13, color: 'var(--app-text-secondary)' }}>Нет ответов</div>
      )}

      {question.kind === 'choice' &&
        question.answered > 0 &&
        question.options.map((option) => (
          <div key={option.label} style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{option.label}</span>
              <span>
                {option.count} · {formatNumber(option.percent)}%
              </span>
            </div>
            <Progress percent={option.percent} showInfo={false} size="small" />
          </div>
        ))}

      {question.kind === 'scale' && question.answered > 0 && (
        <>
          <div style={{ marginTop: 4, fontSize: 13 }}>
            Среднее: <strong>{question.mean === null ? '—' : formatNumber(question.mean)}</strong>
          </div>
          {question.distribution.map((bucket) => (
            <div
              key={bucket.value}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
            >
              <span style={{ width: 36, textAlign: 'right' }}>{formatNumber(bucket.value)}</span>
              <Progress
                percent={(bucket.count / maxCount) * 100}
                showInfo={false}
                size="small"
                style={{ flex: 1, margin: 0 }}
              />
              <span style={{ width: 28 }}>{bucket.count}</span>
            </div>
          ))}
        </>
      )}

      {question.kind === 'text' && question.samples.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
          {question.samples.map((sample, index) => (
            <li key={index} style={{ whiteSpace: 'pre-wrap' }}>
              {sample}
            </li>
          ))}
          {question.answered > question.samples.length && (
            <li style={{ listStyle: 'none', marginLeft: -18, color: 'var(--app-text-secondary)' }}>
              …и ещё {question.answered - question.samples.length} — в выгрузке CSV
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

interface SurveyResultsCardProps {
  results: SurveyResults | null;
  loading: boolean;
  excludeFlagged: boolean;
  onExcludeFlaggedChange: (value: boolean) => void;
}

export const SurveyResultsCard = ({
  results,
  loading,
  excludeFlagged,
  onExcludeFlaggedChange,
}: SurveyResultsCardProps) => (
  <Card
    size="small"
    title="Результаты"
    extra={
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        Исключать ответы с замечаниями
        <Switch
          size="small"
          checked={excludeFlagged}
          onChange={onExcludeFlaggedChange}
          disabled={loading}
        />
      </label>
    }
  >
    {!results ? (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
        <Spin />
      </div>
    ) : results.total === 0 ? (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ответов пока нет" />
    ) : (
      <Spin spinning={loading}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Tag color="blue">В анализе: {results.used}</Tag>
          {results.excluded > 0 && <Tag color="orange">Исключено: {results.excluded}</Tag>}
          {results.median_duration_seconds !== null && (
            <Tag>Медианное время: {formatDuration(results.median_duration_seconds)}</Tag>
          )}
        </div>

        {results.metrics.length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            {results.metrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {results.questions.map((question) => (
            <QuestionBlock key={question.field_id} question={question} />
          ))}
        </div>
      </Spin>
    )}
  </Card>
);
