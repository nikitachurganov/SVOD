import { useEffect, useState } from 'react';
import { Alert, Button, Pagination, Spin } from 'antd';

import { getQuestionAnswers, type QuestionAnswersPage } from '../../api/surveys.api';
import { formatDateTime } from './surveyFormat';

const PAGE_SIZE = 10;

interface QuestionTextAnswersProps {
  surveyId: string;
  fieldId: string;
  excludeFlagged: boolean;
  onOpenResponse: (responseId: string) => void;
}

/** The real answers of one open question — no invented topics or percentages */
export const QuestionTextAnswers = ({
  surveyId,
  fieldId,
  excludeFlagged,
  onOpenResponse,
}: QuestionTextAnswersProps) => {
  const [page, setPage] = useState(1);
  const key = `${surveyId}|${fieldId}|${excludeFlagged}|${page}`;
  const [loaded, setLoaded] = useState<{ key: string; data: QuestionAnswersPage | null } | null>(null);
  // Keep the previous page on screen while the next one loads
  const [shown, setShown] = useState<QuestionAnswersPage | null>(null);

  useEffect(() => {
    let cancelled = false;
    getQuestionAnswers(surveyId, fieldId, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      excludeFlagged,
    })
      .then((data) => {
        if (cancelled) return;
        setLoaded({ key, data });
        setShown(data);
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, surveyId, fieldId, excludeFlagged, page]);

  const current = loaded && loaded.key === key ? loaded : null;
  const loading = current === null;

  if (current !== null && current.data === null) {
    return <Alert type="error" showIcon message="Не удалось загрузить ответы" />;
  }

  return (
    <Spin spinning={loading}>
      <div style={{ fontSize: 13, color: 'var(--app-text-secondary)', marginBottom: 8 }}>
        Непустых ответов: {shown?.total ?? '…'}
      </div>
      {shown && shown.total === 0 && (
        <span style={{ color: 'var(--app-text-secondary)' }}>На этот вопрос пока никто не ответил.</span>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {shown?.items.map((item) => (
          <li key={item.response_id} style={{ padding: '10px 0', borderTop: '1px solid var(--app-border)' }}>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.text}</div>
            <div style={{ marginTop: 2, fontSize: 12, color: 'var(--app-text-secondary)' }}>
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto', fontSize: 12 }}
                onClick={() => onOpenResponse(item.response_id)}
              >
                Ответ №{item.number}
              </Button>{' '}
              · {formatDateTime(item.submitted_at)}
            </div>
          </li>
        ))}
      </ul>
      {shown && shown.total > PAGE_SIZE && (
        <Pagination
          size="small"
          style={{ marginTop: 8 }}
          current={page}
          pageSize={PAGE_SIZE}
          total={shown.total}
          showSizeChanger={false}
          onChange={setPage}
        />
      )}
    </Spin>
  );
};
