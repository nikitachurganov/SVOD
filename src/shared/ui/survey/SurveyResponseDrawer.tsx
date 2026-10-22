import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Grid, Spin, Tag } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import axios from 'axios';

import {
  getSurveyResponseDetail,
  type SurveyQuestion,
  type SurveyResponseDetail,
} from '../../api/surveys.api';
import {
  QUALITY_STATUS_COLOR,
  QUALITY_STATUS_LABEL,
  QUESTION_TYPE_LABEL,
  formatAnswer,
  formatDateTime,
  formatDuration,
} from './surveyFormat';

type Loaded = { key: string; data: SurveyResponseDetail | null; notFound: boolean };

/** The answer as separate items: a multiple choice is a list, anything else one text */
const answerItems = (question: SurveyQuestion, value: unknown): string[] => {
  const labels = new Map(question.options.map((option) => [option.id, option.label]));
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => formatAnswer(labels, item))
    .filter((text): text is string => text !== null);
};

interface SurveyResponseDrawerProps {
  surveyId: string;
  /** null — the drawer is closed */
  responseId: string | null;
  onClose: () => void;
  onNavigate: (responseId: string) => void;
}

/** One submission: every question of the form the respondent saw, with the answer given */
export const SurveyResponseDrawer = ({
  surveyId,
  responseId,
  onClose,
  onNavigate,
}: SurveyResponseDrawerProps) => {
  const isMobile = Grid.useBreakpoint().md === false;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = responseId ? `${surveyId}|${responseId}` : null;

  useEffect(() => {
    if (!key || !responseId) return;
    let cancelled = false;
    getSurveyResponseDetail(surveyId, responseId)
      .then((data) => {
        if (!cancelled) setLoaded({ key, data, notFound: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const notFound = axios.isAxiosError(err) && err.response?.status === 404;
        setLoaded({ key, data: null, notFound });
      });
    return () => {
      cancelled = true;
    };
  }, [key, surveyId, responseId]);

  const current = loaded && loaded.key === key ? loaded : null;
  const detail = current?.data ?? null;
  // Questions a remark is about get a marker, so the reason can be matched with the answer
  const remarked = new Set(detail?.quality_reasons.flatMap((reason) => reason.field_ids) ?? []);

  const title = detail ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span>
        Ответ №{detail.number} из {detail.total}
      </span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, fontWeight: 400 }}>
        <span>{formatDateTime(detail.submitted_at)}</span>
        <span style={{ color: 'var(--app-text-secondary)' }}>
          · заполнение {formatDuration(detail.duration_seconds)}
        </span>
        <Tag color={QUALITY_STATUS_COLOR[detail.quality_status]} style={{ margin: 0 }}>
          {QUALITY_STATUS_LABEL[detail.quality_status]}
        </Tag>
      </span>
    </div>
  ) : (
    'Ответ респондента'
  );

  return (
    <Drawer
      open={responseId !== null}
      onClose={onClose}
      size={isMobile ? '100%' : 640}
      destroyOnHidden
      title={title}
      extra={
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            icon={<LeftOutlined />}
            size={isMobile ? 'large' : 'middle'}
            aria-label="Предыдущий ответ"
            title="Предыдущий (получен раньше)"
            disabled={!detail?.prev_id}
            onClick={() => detail?.prev_id && onNavigate(detail.prev_id)}
          />
          <Button
            icon={<RightOutlined />}
            size={isMobile ? 'large' : 'middle'}
            aria-label="Следующий ответ"
            title="Следующий (получен позже)"
            disabled={!detail?.next_id}
            onClick={() => detail?.next_id && onNavigate(detail.next_id)}
          />
        </div>
      }
    >
      {current === null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin />
        </div>
      )}

      {current !== null && detail === null && (
        <Alert
          type="error"
          showIcon
          message={current.notFound ? 'Ответ не найден' : 'Не удалось загрузить ответ'}
          description={
            current.notFound
              ? 'Возможно, он относится к другому опросу или ссылка устарела.'
              : 'Попробуйте закрыть окно и открыть ответ ещё раз.'
          }
        />
      )}

      {detail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {detail.quality_reasons.length > 0 && (
            <Alert
              type={detail.quality_status === 'flagged' ? 'warning' : 'info'}
              showIcon
              message={
                detail.quality_status === 'flagged'
                  ? 'По ответу есть замечания'
                  : 'Ответ стоит проверить'
              }
              description={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.quality_reasons.map((reason) => (
                    <div key={reason.code}>
                      <strong>{reason.title}.</strong> {reason.explanation}
                    </div>
                  ))}
                  <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                    Ответ сохранён полностью и показан ниже, он не удалён.
                  </span>
                </div>
              }
            />
          )}

          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {detail.questions.map((question, index) => {
              const items = answerItems(question, detail.answers[question.id]);
              return (
                <li
                  key={question.id}
                  style={{
                    padding: '12px 0 12px 10px',
                    borderTop: index === 0 ? undefined : '1px solid var(--app-border)',
                    borderLeft: remarked.has(question.id) ? '3px solid var(--app-warning, #d48806)' : '3px solid transparent',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                    {index + 1}. {QUESTION_TYPE_LABEL[question.type] ?? question.type}
                    {remarked.has(question.id) && ' · см. замечание выше'}
                  </div>
                  <div style={{ fontWeight: 600, margin: '2px 0 4px', wordBreak: 'break-word' }}>
                    {question.label}
                  </div>
                  {items.length === 0 ? (
                    <div style={{ color: 'var(--app-text-secondary)', fontStyle: 'italic' }}>
                      Вопрос пропущен
                    </div>
                  ) : items.length > 1 ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {items.map((item, itemIndex) => (
                        <li key={itemIndex} style={{ wordBreak: 'break-word' }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{items[0]}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Drawer>
  );
};
