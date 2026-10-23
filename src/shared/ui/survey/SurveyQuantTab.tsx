import { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Segmented, Select, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

import {
  getSurveyCrosstab,
  type CrosstabResult,
  type QuestionStat,
  type SurveyResults,
} from '../../api/surveys.api';
import { CrosstabView } from './CrosstabView';
import { QuestionTextAnswers } from './QuestionTextAnswers';
import { AnalyticsCard } from './AnalyticsCard';
import { DistributionBars } from './DistributionBars';
import { ScaleHistogram } from './SurveyCharts';
import { formatNumber } from './surveyFormat';

const CROSSTAB_ERRORS: Record<string, string> = {
  unsupported_question_type: 'Открытые вопросы нельзя сопоставлять — выберите вопросы с вариантами или шкалой.',
  too_many_categories: 'У шкалы слишком много разных значений — сопоставьте её с вопросом с вариантами.',
  question_not_found: 'Вопрос не найден — обновите страницу.',
};

const crosstabError = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string' && CROSSTAB_ERRORS[detail]) return CROSSTAB_ERRORS[detail];
  }
  return 'Не удалось построить кросстабуляцию. Попробуйте ещё раз.';
};

/** Raw SUS / UEQ items are summarised by their metric card — they would only add noise here */
const isNoise = (q: QuestionStat): boolean => q.methodology === 'sus' || q.methodology === 'ueq';

const KIND_LABEL: Record<QuestionStat['kind'], string> = {
  choice: 'выбор',
  scale: 'шкала',
  text: 'текст',
};

type View = 'chart' | 'table';

const ViewSwitch = ({ value, onChange }: { value: View; onChange: (v: View) => void }) => (
  <Segmented<View>
    size="small"
    value={value}
    onChange={onChange}
    options={[
      { label: 'График', value: 'chart' },
      { label: 'Таблица', value: 'table' },
    ]}
    aria-label="Вид представления"
  />
);

const ChoiceBody = ({ question, view }: { question: QuestionStat; view: View }) => {
  const marks = question.options.reduce((sum, o) => sum + o.count, 0);
  const multiple = question.type === 'checkbox';
  return (
    <>
      {view === 'chart' ? (
        <DistributionBars options={question.options} label={question.label} />
      ) : (
        <Table
          size="small"
          pagination={false}
          rowKey="label"
          dataSource={question.options}
          columns={[
            { title: 'Вариант', dataIndex: 'label', key: 'label' },
            { title: 'Ответов', dataIndex: 'count', key: 'count', align: 'right' },
            {
              title: 'Доля',
              dataIndex: 'percent',
              key: 'percent',
              align: 'right',
              render: (v: number) => `${formatNumber(v)}%`,
            },
          ]}
        />
      )}
      {multiple && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--app-text-secondary)' }}>
          Можно выбрать несколько вариантов: доля — это часть ответивших на вопрос, поэтому сумма
          долей может превышать 100%. Всего отметок: {marks}.
        </div>
      )}
    </>
  );
};

const ScaleBody = ({ question, view }: { question: QuestionStat; view: View }) => {
  const stats: Array<[string, number | null]> = [
    ['Среднее', question.mean],
    ['Медиана', question.median],
    ['Мода', question.mode],
    ['σ', question.std],
  ];
  return (
    <>
      <dl className="survey-stat-row" style={{ marginBottom: 12 }}>
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value === null ? '—' : formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
      {view === 'chart' ? (
        <ScaleHistogram distribution={question.distribution} />
      ) : (
        <Table
          size="small"
          pagination={false}
          rowKey="value"
          dataSource={question.distribution}
          columns={[
            { title: 'Значение', dataIndex: 'value', key: 'value', render: (v: number) => formatNumber(v) },
            { title: 'Ответов', dataIndex: 'count', key: 'count', align: 'right' },
            {
              title: 'Доля',
              key: 'share',
              align: 'right',
              render: (_, bucket) =>
                `${formatNumber(question.answered ? (bucket.count / question.answered) * 100 : 0)}%`,
            },
          ]}
        />
      )}
    </>
  );
};

interface QuestionCardProps {
  question: QuestionStat;
  used: number;
  surveyId: string;
  excludeFlagged: boolean;
  onOpenResponse: (responseId: string) => void;
}

/** One question: how many answered, how many skipped, and the answers themselves */
const QuestionCard = ({ question, used, surveyId, excludeFlagged, onOpenResponse }: QuestionCardProps) => {
  const skipped = Math.max(0, used - question.answered);
  const [view, setView] = useState<View>('chart');
  const hasChart = question.answered > 0 && question.kind !== 'text';
  return (
    <AnalyticsCard
      id={`question-${question.field_id}`}
      wide={question.kind === 'text'}
      title={question.label}
      actions={hasChart ? <ViewSwitch value={view} onChange={setView} /> : undefined}
      meta={
        <>
          <span>
            Ответили: <strong>{question.answered}</strong> из {used}
          </span>
          {skipped > 0 && <span>Пропустили: {skipped}</span>}
        </>
      }
    >
      {question.answered === 0 && question.kind !== 'text' && (
        <span style={{ color: 'var(--app-text-secondary)' }}>Пока нет ответов на этот вопрос</span>
      )}
      {question.answered > 0 && question.kind === 'choice' && <ChoiceBody question={question} view={view} />}
      {question.answered > 0 && question.kind === 'scale' && <ScaleBody question={question} view={view} />}
      {question.kind === 'text' && (
        <QuestionTextAnswers
          surveyId={surveyId}
          fieldId={question.field_id}
          excludeFlagged={excludeFlagged}
          onOpenResponse={onOpenResponse}
        />
      )}
    </AnalyticsCard>
  );
};

interface SurveyQuantTabProps {
  surveyId: string;
  results: SurveyResults;
  excludeFlagged: boolean;
  onOpenResponse: (responseId: string) => void;
}

export const SurveyQuantTab = ({ surveyId, results, excludeFlagged, onOpenResponse }: SurveyQuantTabProps) => {
  const shown = useMemo(() => results.questions.filter((q) => !isNoise(q)), [results.questions]);
  const comparable = useMemo(
    () => shown.filter((q) => q.kind !== 'text' && q.answered > 0),
    [shown],
  );
  const scaleQuestions = comparable.filter((q) => q.kind === 'scale');

  const [rowId, setRowId] = useState<string | undefined>();
  const [colId, setColId] = useState<string | undefined>();
  // The answer is stored together with the request it belongs to, so "loading" is derived:
  // there is a request for the current selection but no answer for it yet.
  const [answer, setAnswer] = useState<{
    key: string;
    data: CrosstabResult | null;
    error: string | null;
  } | null>(null);
  const requestKey =
    rowId && colId && rowId !== colId ? `${surveyId}|${rowId}|${colId}|${excludeFlagged}` : null;

  useEffect(() => {
    if (!requestKey || !rowId || !colId) return;
    let cancelled = false;
    getSurveyCrosstab(surveyId, rowId, colId, excludeFlagged)
      .then((data) => {
        if (!cancelled) setAnswer({ key: requestKey, data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setAnswer({ key: requestKey, data: null, error: crosstabError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, surveyId, rowId, colId, excludeFlagged]);

  const current = answer && answer.key === requestKey ? answer : null;
  const crosstab = current?.data ?? null;
  const crosstabErr = current?.error ?? null;
  const crosstabLoading = requestKey !== null && current === null;

  const options = comparable.map((q) => ({
    value: q.field_id,
    label: `${q.label} (${KIND_LABEL[q.kind]})`,
  }));
  const sameQuestion = rowId !== undefined && rowId === colId;

  const columns: ColumnsType<QuestionStat> = [
    { title: 'Вопрос', dataIndex: 'label', key: 'label' },
    { title: 'n', dataIndex: 'answered', key: 'n', align: 'right' },
    {
      title: 'Среднее',
      key: 'mean',
      align: 'right',
      render: (_, q) => (q.mean === null ? '—' : formatNumber(q.mean)),
    },
    {
      title: 'Медиана',
      key: 'median',
      align: 'right',
      render: (_, q) => (q.median === null ? '—' : formatNumber(q.median)),
    },
    {
      title: 'Мода',
      key: 'mode',
      align: 'right',
      render: (_, q) => (q.mode === null ? '—' : formatNumber(q.mode)),
    },
    {
      title: 'σ',
      key: 'std',
      align: 'right',
      render: (_, q) => (q.std === null ? '—' : formatNumber(q.std)),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {scaleQuestions.length > 0 && (
        <Card size="small" title="Описательная статистика">
          <Table<QuestionStat>
            rowKey="field_id"
            size="small"
            columns={columns}
            dataSource={scaleQuestions}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--app-text-secondary)' }}>
            σ — стандартное отклонение (выборочное, n − 1).
          </div>
        </Card>
      )}

      {comparable.length >= 2 && (
        <Card size="small" title="Кросстабуляция">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Select
              style={{ flex: '1 1 260px', minWidth: 0 }}
              placeholder="Первый вопрос"
              value={rowId}
              onChange={setRowId}
              options={options}
              showSearch
              optionFilterProp="label"
              aria-label="Первый вопрос кросстабуляции"
            />
            <Select
              style={{ flex: '1 1 260px', minWidth: 0 }}
              placeholder="Второй вопрос"
              value={colId}
              onChange={setColId}
              options={options}
              showSearch
              optionFilterProp="label"
              aria-label="Второй вопрос кросстабуляции"
            />
          </div>
          <div style={{ marginTop: 12 }}>
            {!rowId || !colId ? (
              <span style={{ color: 'var(--app-text-secondary)' }}>
                Выберите два вопроса, например «Курс» и «Оценка сервиса», чтобы увидеть, как ответы
                на один связаны с другим.
              </span>
            ) : sameQuestion ? (
              <Alert type="info" showIcon message="Выберите два разных вопроса" />
            ) : crosstabErr ? (
              <Alert type="error" showIcon message={crosstabErr} />
            ) : (
              <Spin spinning={crosstabLoading}>
                {crosstab && <CrosstabView result={crosstab} />}
              </Spin>
            )}
          </div>
        </Card>
      )}

      {shown.length > 0 && (
        <div>
          <h3 className="survey-section-title">Результаты по вопросам</h3>
          <div className="survey-chart-grid">
            {shown.map((q) => (
              <QuestionCard
                key={q.field_id}
                question={q}
                used={results.used}
                surveyId={surveyId}
                excludeFlagged={excludeFlagged}
                onOpenResponse={onOpenResponse}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
