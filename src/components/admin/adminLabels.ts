import type { AdminLimits, AdminUserRow } from '../../types/admin';

export const PLAN_TITLES: Record<string, string> = {
  start: 'Старт',
  pack: 'Исследование',
  researcher: 'Исследователь',
};

export const STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  trialing: 'Пробный период',
  past_due: 'Ожидает оплаты',
  expired: 'Закончилась',
};

export const INTERVAL_LABELS: Record<string, string> = {
  none: '—',
  month: 'Месяц',
  year: 'Год',
  one_off: 'Разово',
};

/** What a person asked for in the plan request */
export const REQUEST_TERM_LABELS: Record<string, string> = {
  month: 'на месяц',
  year: 'на год',
  one_off: 'разовый доступ «Исследование»',
};

/** How many days the plan runs when nobody names a term: the same as the server's default */
export const REQUEST_TERM_DAYS: Record<string, number> = {
  month: 30,
  year: 365,
  one_off: 60,
};

export const LIMIT_LABELS: Record<keyof AdminLimits, string> = {
  ai_tokens_per_period: 'Токенов ИИ за период',
  responses_per_period: 'Ответов за период',
  max_active_surveys: 'Открытых опросов',
  max_projects: 'Проектов',
  max_questions: 'Вопросов в опросе',
  max_analyzed_responses: 'Ответов в анализе',
};

export const EVENT_LABELS: Record<string, string> = {
  created: 'Подписка создана',
  manual_grant: 'Тариф выдан вручную',
  trial_started: 'Начался пробный период',
  trial_ending_notified: 'Напоминание об окончании пробного периода',
  expiring_notified: 'Напоминание об окончании тарифа',
  expired: 'Тариф закончился, переход на «Старт»',
  downgrade_closed_surveys: 'Опросы закрыты после понижения тарифа',
  canceled: 'Продление отменено',
  resumed: 'Продление возобновлено',
  limit_warning: 'Предупреждение о лимите',
  responses_unlocked: 'Открыты ответы сверх квоты',
  deletion_scheduled: 'Запрошено удаление аккаунта',
  deletion_canceled: 'Удаление аккаунта отменено',
  deletion_blocked: 'Удаление аккаунта не удалось',
  deletion_reminder_7d: 'Напоминание об удалении за 7 дней',
  deletion_reminder_1d: 'Напоминание об удалении за день',
  plan_request_created: 'Заявка на тариф отправлена',
  plan_request_approved: 'Заявка одобрена, тариф подключён',
  plan_request_rejected: 'Заявка отклонена',
  account_blocked: 'Аккаунт заблокирован',
  account_unblocked: 'Аккаунт разблокирован',
  ai_disabled: 'ИИ отключён',
  ai_enabled: 'ИИ включён',
  admin_revoked: 'Тариф снят администратором',
  payment_succeeded: 'Оплата получена, тариф продлён',
  payment_canceled: 'Оплата не прошла',
  payment_refunded: 'Возврат по платежу',
  payment_mismatch: 'Сумма платежа не совпала, тариф не выдан',
};

export const PAYMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'Создаётся', color: 'default' },
  pending: { label: 'Ждёт оплаты', color: 'gold' },
  succeeded: { label: 'Оплачен', color: 'success' },
  canceled: { label: 'Не оплачен', color: 'default' },
  failed: { label: 'Не создан', color: 'error' },
  mismatch: { label: 'Сумма не совпала', color: 'error' },
};

export const AI_ACTION_LABELS: Record<string, string> = {
  survey_build: 'Создание опроса',
  survey_edit: 'Правка опроса',
  ai_summary: 'ИИ-резюме',
  ai_chat: 'Чат по результатам',
};

export const personName = (user: Pick<AdminUserRow, 'first_name' | 'last_name' | 'middle_name'>) =>
  [user.last_name, user.first_name, user.middle_name].filter(Boolean).join(' ');

export const formatDate = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

export const formatDateTime = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const formatRub = (kopecks: number): string =>
  `${(kopecks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;

export const formatUsd = (usd: number): string =>
  `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
