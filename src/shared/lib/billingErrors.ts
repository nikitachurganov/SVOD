import axios from 'axios';

/** Fired on window when the server answers 402 «limit reached»; the paywall window listens to it */
export const PAYWALL_EVENT = 'svod:paywall';

export type BillingErrorCode = 'limit_reached' | 'ai_disabled' | 'ai_budget_exceeded';

/** What the server says when a plan limit, a plan feature or the AI switch stops an action */
export interface BillingError {
  status: number;
  code: BillingErrorCode;
  /** A sentence in Russian, ready to show */
  message: string;
  /** active_surveys, projects, questions, ai_actions, ai_budget, feature, … */
  limit?: string;
  feature?: string;
  used?: number;
  max?: number;
  plan?: string;
  /** The plan that lifts the limit; empty when the person is already on the top one */
  upgradeTo?: string | null;
  /** When a periodic limit starts again */
  resetsAt?: string | null;
}

const FEATURE_TEXT: Record<string, string> = {
  crosstabs: 'Кросстабы доступны на тарифе «Исследователь».',
  csv_export: 'Выгрузка ответов в CSV доступна на тарифе «Исследователь».',
  quality_filter: 'Фильтр некачественных ответов доступен на тарифе «Исследователь».',
  methodology: 'Часть выбранных методик доступна на тарифе «Исследователь».',
};

const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

const describeLimit = (detail: Record<string, unknown>): string => {
  const limit = typeof detail.limit === 'string' ? detail.limit : '';
  const max = typeof detail.max === 'number' ? detail.max : undefined;
  const resets =
    typeof detail.resets_at === 'string' ? ` Лимит обновится ${formatDay(detail.resets_at)}.` : '';
  switch (limit) {
    case 'ai_actions':
      return `ИИ-действия на этот период закончились${max !== undefined ? ` (${max})` : ''}.${resets}`;
    case 'ai_budget':
      return `Исчерпан лимит расходов на ИИ в этом периоде.${resets}`;
    case 'active_surveys':
      return `На вашем тарифе можно держать открытыми не больше ${max ?? 'нескольких'} опросов. Закройте один из них или повысьте тариф.`;
    case 'projects':
      return `На вашем тарифе можно создать не больше ${max ?? 'нескольких'} проектов.`;
    case 'questions':
      return `На вашем тарифе в опросе может быть не больше ${max ?? 'нескольких'} вопросов.`;
    case 'feature': {
      const feature = typeof detail.feature === 'string' ? detail.feature : '';
      return FEATURE_TEXT[feature] ?? 'Эта возможность доступна на тарифе «Исследователь».';
    }
    default:
      return `Лимит вашего тарифа исчерпан.${resets}`;
  }
};

/** Recognises the answers of the billing guard; null for any other error */
export const parseBillingError = (err: unknown): BillingError | null => {
  if (!axios.isAxiosError(err)) return null;
  const status = err.response?.status;
  const detail: unknown = err.response?.data?.detail;
  if (!detail || typeof detail !== 'object') return null;
  const data = detail as Record<string, unknown>;

  if (status === 402 && data.code === 'limit_reached') {
    return {
      status,
      code: 'limit_reached',
      message: describeLimit(data),
      limit: typeof data.limit === 'string' ? data.limit : undefined,
      feature: typeof data.feature === 'string' ? data.feature : undefined,
      used: typeof data.used === 'number' ? data.used : undefined,
      max: typeof data.max === 'number' ? data.max : undefined,
      plan: typeof data.plan === 'string' ? data.plan : undefined,
      upgradeTo: typeof data.upgrade_to === 'string' ? data.upgrade_to : null,
      resetsAt: typeof data.resets_at === 'string' ? data.resets_at : null,
    };
  }
  if (status === 403 && data.code === 'ai_disabled') {
    return {
      status,
      code: 'ai_disabled',
      message:
        typeof data.message === 'string'
          ? data.message
          : 'ИИ отключён для вашего аккаунта. Напишите в поддержку.',
    };
  }
  if (status === 503 && data.code === 'ai_budget_exceeded') {
    return {
      status,
      code: 'ai_budget_exceeded',
      message:
        typeof data.message === 'string' ? data.message : 'ИИ временно недоступен. Попробуйте позже.',
    };
  }
  return null;
};

/** The text for an inline error of an AI action; null when the error is not a billing one */
export const billingErrorMessage = (err: unknown): string | null => parseBillingError(err)?.message ?? null;

export const announcePaywall = (error: BillingError): void => {
  window.dispatchEvent(new CustomEvent<BillingError>(PAYWALL_EVENT, { detail: error }));
};
