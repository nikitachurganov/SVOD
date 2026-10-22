import { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Select, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

import {
  getSurveyCrosstab,
  type CrosstabResult,
  type QuestionStat,
  type SurveyResults,
} from '../../api/surveys.api';
import { CrosstabView } from './CrosstabView';
import { OptionsBarChart, ScaleHistogram } from './SurveyCharts';
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

const QuestionCard = ({ question }: { question: QuestionStat }) => (
  <Card
    size="small"
    title={question.label}
    extra={<span style={{ fontSize: 12 }}>ответов: {question.answered}</span>}
  >
    {question.answered === 0 && (
      <span style={{ color: 'var(--app-text-secondary)' }}>Нет ответов</span>
    )}
    {question.answered > 0 && question.kind === 'choice' && (
      <OptionsBarChart options={question.options} />
    )}
    {question.answered > 0 && question.kind === 'scale' && (
      <>
        <div style={{ fontSize: 13, marginBottom: 4 }}>
          Среднее: <strong>{question.mean === null ? '—' : formatNumber(question.mean)}</strong>
        </div>
        <ScaleHistogram distribution={question.distribution} />
      </>
    )}
  </Card>
);

interface SurveyQuantTabProps {
  surveyId: string;
  results: SurveyResults;
  excludeFlagged: boolean;
}

export const SurveyQuantTab = ({ surveyId, results, excludeFlagged }: SurveyQuantTabProps) => {
  const questions = useMemo(
    () => results.questions.filter((q) => q.kind !== 'text' && q.answered > 0 && !isNoise(q)),
    [results.questions],
  );
  const scaleQuestions = questions.filter((q) => q.kind === 'scale');
  const textQuestions = results.questions.filter((q) => q.kind === 'text' && q.samples.length > 0);

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

  const options = questions.map((q) => ({
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {questions.length >= 2 && (
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

      {questions.length > 0 && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
          {questions.map((q) => (
            <QuestionCard key={q.field_id} question={q} />
          ))}
        </div>
      )}

      {textQuestions.length > 0 && (
        <Card size="small" title="Открытые ответы">
          {textQuestions.map((q) => (
            <div key={q.field_id} style={{ padding: '8px 0', borderTop: '1px solid var(--app-border)' }}>
              <strong>{q.label}</strong>{' '}
              <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                ответов: {q.answered}
              </span>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                {q.samples.map((sample, index) => (
                  <li key={index} style={{ whiteSpace: 'pre-wrap' }}>
                    {sample}
                  </li>
                ))}
                {q.answered > q.samples.length && (
                  <li style={{ listStyle: 'none', marginLeft: -18, color: 'var(--app-text-secondary)' }}>
                    …и ещё {q.answered - q.samples.length} — в выгрузке CSV
                  </li>
                )}
              </ul>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};
