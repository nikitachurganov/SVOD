import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Grid, Spin, Tag } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import axios from 'axios';

import { getSurveyResponseDetail, type SurveyResponseDetail } from '../../api/surveys.api';
import { QUESTION_TYPE_LABEL, formatAnswer, formatDateTime, formatDuration } from './surveyFormat';

const FLAG_LABEL: Record<string, string> = {
  failed_attention_check: 'Не прошёл проверку внимания',
  too_fast: 'Слишком быстро',
};

type Loaded = { key: string; data: SurveyResponseDetail | null; notFound: boolean };

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
  const flags = Object.entries(detail?.quality_flags ?? {}).filter(([, value]) => value);

  return (
    <Drawer
      open={responseId !== null}
      onClose={onClose}
      size={isMobile ? '100%' : 640}
      destroyOnHidden
      title={detail ? `Ответ №${detail.number} из ${detail.total}` : 'Ответ респондента'}
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Получен {formatDateTime(detail.submitted_at)}</span>
            <span style={{ color: 'var(--app-text-secondary)' }}>
              · Время заполнения: {formatDuration(detail.duration_seconds)}
            </span>
            {flags.map(([flag]) => (
              <Tag key={flag} color="orange" style={{ margin: 0 }}>
                {FLAG_LABEL[flag] ?? flag}
              </Tag>
            ))}
          </div>

          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {detail.questions.map((question, index) => {
              const labels = new Map(question.options.map((option) => [option.id, option.label]));
              const text = formatAnswer(labels, detail.answers[question.id]);
              return (
                <li
                  key={question.id}
                  style={{ padding: '12px 0', borderTop: index === 0 ? undefined : '1px solid var(--app-border)' }}
                >
                  <div style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                    {index + 1}. {QUESTION_TYPE_LABEL[question.type] ?? question.type}
                  </div>
                  <div style={{ fontWeight: 600, margin: '2px 0 4px', wordBreak: 'break-word' }}>
                    {question.label}
                  </div>
                  {text === null ? (
                    <div style={{ color: 'var(--app-text-secondary)', fontStyle: 'italic' }}>
                      Вопрос пропущен
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>
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
