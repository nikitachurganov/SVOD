import type { PlanLimits } from '../../types/billing';

export const formatPrice = (kopecks: number): string =>
  `${(kopecks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;

export const formatNumber = (value: number): string => value.toLocaleString('ru-RU');

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

/** The rows of the comparison, in the order a person weighs a plan */
export const LIMIT_ROWS: { key: keyof PlanLimits; label: string }[] = [
  { key: 'ai_actions_per_period', label: 'ИИ-действий в месяц' },
  { key: 'responses_per_period', label: 'Ответов в месяц' },
  { key: 'max_active_surveys', label: 'Открытых опросов' },
  { key: 'max_projects', label: 'Проектов' },
  { key: 'max_questions', label: 'Вопросов в одном опросе' },
  { key: 'max_analyzed_responses', label: 'Ответов в анализе одного опроса' },
];

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
  one_off: 'пакет «Курсовая»',
};
