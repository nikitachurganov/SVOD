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

/** The server counts the AI allowance in tokens; people see it in credits (docs/MONETIZATION_MODEL.md, 0) */
export const TOKENS_PER_CREDIT = 1_000;

/** Rounded up, so an allowance that is not used up never reads «0 credits» */
export const toCredits = (tokens: number): number => Math.ceil(tokens / TOKENS_PER_CREDIT);

/** «150», «2 000», «6 000» */
export const formatCredits = (tokens: number): string => formatNumber(toCredits(tokens));

/** «1 кредит», «2 кредита», «5 кредитов» */
export const creditsWord = (count: number): string => {
  const rest100 = count % 100;
  const rest10 = count % 10;
  if (rest100 >= 11 && rest100 <= 14) return 'кредитов';
  if (rest10 === 1) return 'кредит';
  if (rest10 >= 2 && rest10 <= 4) return 'кредита';
  return 'кредитов';
};

/** «150 кредитов» for a size given in tokens */
export const formatCreditsWithWord = (tokens: number): string =>
  `${formatCredits(tokens)} ${creditsWord(toCredits(tokens))}`;

/** What the AI actions cost, roughly; an estimate until it is replaced with the numbers of ai_usage_log */
/** An amount of an AI allowance in its own unit: credits of a person's plan, the team's tokens as they are */
export const formatQuotaAmount = (value: number, unit: 'credits' | 'tokens_plus' | 'tokens'): string =>
  unit === 'credits' ? formatCredits(value) : formatNumber(value);

export const quotaUnitWord = (unit: 'credits' | 'tokens_plus' | 'tokens'): string =>
  unit === 'credits' ? 'кредитов ИИ' : unit === 'tokens_plus' ? 'Токенов+' : 'бесплатных токенов';

/** What an AI action costs in the team model: ~3 700 tokens, weighted 0.2 on the base model and 1 on a strong
 * one (docs/TARIFFS_FINAL.md, section 10); the free tokens of the base model count one to one */
export const TEAM_ACTION_HINT =
  'Действие с ИИ стоит около 750 Токенов+ на базовой модели и около 3 700 на сильной.';

export const AI_ACTION_HINT =
  'Создание анкеты стоит около 9 кредитов, резюме ответов — около 4, сообщение в чате — около 10.';

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
