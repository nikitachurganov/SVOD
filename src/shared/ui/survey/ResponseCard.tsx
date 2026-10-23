import type { KeyboardEvent } from 'react';
import { Tag } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';

import type { SurveyResponseItem } from '../../api/surveys.api';
import {
  QUALITY_STATUS_COLOR,
  QUALITY_STATUS_LABEL,
  formatDateTime,
  formatDuration,
  formatRelative,
} from './surveyFormat';

const shorten = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

interface ResponseCardProps {
  response: SurveyResponseItem;
  selected: boolean;
  onOpen: (responseId: string) => void;
}

/**
 * One respondent as a card: who and when, what they said in their own words, a few short answers.
 * The whole card opens the full answer.
 */
export const ResponseCard = ({ response, selected, onOpen }: ResponseCardProps) => {
  const quote = response.preview.find((item) => item.kind === 'text');
  const values = response.preview.filter((item) => item.kind === 'value');
  const open = () => onOpen(response.id);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };

  return (
    <article
      className={`survey-response survey-response--${response.quality_status}${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Открыть ответ №${response.number}`}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <header className="survey-response__head">
        <span className="survey-response__avatar" aria-hidden="true">
          {response.number}
        </span>
        <div className="survey-response__who">
          <strong>Ответ №{response.number}</strong>
          <span title={formatDateTime(response.submitted_at)}>
            {formatRelative(response.submitted_at)} · заполнение {formatDuration(response.duration_seconds)}
          </span>
        </div>
        {response.quality_status !== 'ok' && (
          <Tag color={QUALITY_STATUS_COLOR[response.quality_status]} style={{ margin: 0 }}>
            {QUALITY_STATUS_LABEL[response.quality_status]}
          </Tag>
        )}
      </header>

      {quote && (
        <blockquote className="survey-response__quote">
          <p>{quote.text}</p>
          <cite title={quote.label}>{shorten(quote.label, 60)}</cite>
        </blockquote>
      )}

      {values.length > 0 && (
        <ul className="survey-response__chips">
          {values.map((item) => (
            <li key={item.label} title={`${item.label}: ${item.text}`}>
              <span>{shorten(item.label, 24)}</span>
              <strong>{shorten(item.text, 36)}</strong>
            </li>
          ))}
        </ul>
      )}

      {response.preview.length === 0 && (
        <p className="survey-response__empty">В этом ответе нет заполненных вопросов</p>
      )}

      <footer className="survey-response__more">
        Открыть ответ <ArrowRightOutlined aria-hidden="true" />
      </footer>
    </article>
  );
};
