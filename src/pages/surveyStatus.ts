import type { SurveyStatus } from '../shared/api/surveys.api';

export const SURVEY_STATUS_LABEL: Record<SurveyStatus, string> = {
  draft: 'Черновик',
  open: 'Открыт',
  closed: 'Закрыт',
  archived: 'В архиве',
};

export const SURVEY_STATUS_COLOR: Record<SurveyStatus, string> = {
  draft: 'default',
  open: 'green',
  closed: 'orange',
  archived: 'default',
};

export const formatSurveyDate = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const pluralizeResponses = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ответ`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ответа`;
  return `${n} ответов`;
};
