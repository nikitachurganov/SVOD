import type { PlanLimits } from '../../types/billing';

export const formatPrice = (kopecks: number): string =>
  `${(kopecks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;

export const formatNumber = (value: number): string => value.toLocaleString('ru-RU');

/** The server stands in a huge number for «no limit» */
export const isUnlimited = (value: number): boolean => value >= 100_000_000;

export const formatLimit = (value: number): string =>
  isUnlimited(value) ? 'Без ограничений' : formatNumber(value);

const roundOne = (value: number): string =>
  (Math.round(value * 10) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 });

/** The size of an AI allowance in a few characters: «150 тыс.», «2 млн», «742» */
export const formatTokens = (value: number): string => {
  if (value >= 1_000_000) return `${roundOne(value / 1_000_000)} млн`;
  if (value >= 1_000) return `${roundOne(value / 1_000)} тыс.`;
  return formatNumber(value);
};

/** «1 токен», «2 токена», «5 токенов» */
export const tokensWord = (count: number): string => {
  const rest100 = count % 100;
  const rest10 = count % 10;
  if (rest100 >= 11 && rest100 <= 14) return 'токенов';
  if (rest10 === 1) return 'токен';
  if (rest10 >= 2 && rest10 <= 4) return 'токена';
  return 'токенов';
};

export const formatDay = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

export const FEATURE_LABELS: Record<string, string> = {
  crosstabs: 'Кросстабы: сравнение ответов по группам',
  csv_export: 'Выгрузка ответов в CSV',
  quality_filter: 'Фильтр некачественных ответов',
  all_methodologies: 'Все методики опросов',
};

/** The limits on collecting data: «no limit» on every plan of the catalogue */
export const COLLECTING_LIMITS: (keyof PlanLimits)[] = [
  'max_active_surveys',
  'max_projects',
  'max_questions',
  'responses_per_period',
  'max_analyzed_responses',
];

/** Whether the plan lets a person collect and read as much as they like */
export const collectsWithoutLimits = (limits: PlanLimits): boolean =>
  COLLECTING_LIMITS.every((key) => isUnlimited(limits[key]));

export const STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  trialing: 'Пробный период',
  past_due: 'Ожидает оплаты',
  expired: 'Закончилась',
};

/** What a person asked for in a plan request */
export const TERM_LABELS: Record<string, string> = {
  month: 'на месяц',
  year: 'на год',
  one_off: 'разовый доступ «Исследование»',
};
