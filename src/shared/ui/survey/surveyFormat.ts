export const formatNumber = (value: number): string =>
  value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

export const formatDuration = (seconds: number | null): string => {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} мин ${s} с` : `${s} с`;
};

export const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

const RELATIVE = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });

/** "только что", "2 часа назад", "вчера"; older than a week — the date */
export const formatRelative = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'только что';
  if (seconds < 3600) return RELATIVE.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return RELATIVE.format(-Math.floor(seconds / 3600), 'hour');
  if (seconds < 7 * 86400) return RELATIVE.format(-Math.floor(seconds / 86400), 'day');
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

/** Local calendar day, used to group a list by day */
export const dayKey = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/** "Сегодня", "Вчера", "22 октября" (with the year when it is not the current one) */
export const dayHeading = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
};

export const formatP = (p: number): string => (p < 0.0001 ? '< 0,0001' : formatNumber(p));

export const QUALITY_STATUS_LABEL = {
  ok: 'Без замечаний',
  review: 'Требует проверки',
  flagged: 'Есть замечания',
} as const;

export const QUALITY_STATUS_COLOR = {
  ok: 'green',
  review: 'gold',
  flagged: 'orange',
} as const;

const OTHER_PREFIX = '__other__:';

const NPS_CATEGORY_LABEL: Record<string, string> = {
  promoter: 'промоутер',
  passive: 'нейтрал',
  detractor: 'критик',
};

/**
 * The rating field stores its answer as { value, min, max } (an NPS one also carries a category).
 * Anything else that is an object is shown as it is, so nothing is lost.
 */
const formatRatingObject = (value: Record<string, unknown>): string => {
  if (typeof value.value !== 'number') return JSON.stringify(value);
  const scale = typeof value.max === 'number' ? ` из ${value.max}` : '';
  const category =
    typeof value.npsCategory === 'string'
      ? ` (${NPS_CATEGORY_LABEL[value.npsCategory] ?? value.npsCategory})`
      : '';
  return `${value.value}${scale}${category}`;
};

/** Human-readable answer; null when the respondent skipped the question */
export const formatAnswer = (labels: Map<string, string>, value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => formatAnswer(labels, item))
      .filter((part): part is string => part !== null);
    return parts.length ? parts.join('; ') : null;
  }
  if (typeof value === 'object') return formatRatingObject(value as Record<string, unknown>);
  const text = String(value);
  if (!text.trim()) return null;
  if (text.startsWith(OTHER_PREFIX)) return `Другое: ${text.slice(OTHER_PREFIX.length)}`;
  return labels.get(text) ?? text;
};

const RATING_VARIANT_LABEL: Record<string, string> = {
  stars: 'Оценка звёздами',
  numeric_scale: 'Числовая шкала',
  slider: 'Ползунок',
  nps: 'Шкала от 0 до 10',
};

const ANSWER_KIND_LABEL: Record<string, string> = {
  shortText: 'Краткий ответ',
  longText: 'Развёрнутый ответ',
  fullName: 'ФИО',
  email: 'E-mail',
  phone: 'Телефон',
  radio: 'Один вариант',
  checkbox: 'Несколько вариантов',
  dropdown: 'Выбор из списка',
  yesNo: 'Да / Нет',
  number: 'Число',
  date: 'Дата',
  dateTime: 'Дата и время',
  time: 'Время',
};

/** How the respondent answers, in plain words (for the list of questions of the form) */
export const answerKindLabel = (type: string, config?: Record<string, unknown>): string => {
  if (type === 'rating') {
    const variant = config?.ratingVariant;
    return (typeof variant === 'string' && RATING_VARIANT_LABEL[variant]) || 'Оценка';
  }
  return ANSWER_KIND_LABEL[type] ?? type;
};

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  shortText: 'Короткий текст',
  longText: 'Длинный текст',
  fullName: 'ФИО',
  email: 'E-mail',
  phone: 'Телефон',
  radio: 'Один вариант',
  checkbox: 'Несколько вариантов',
  dropdown: 'Выпадающий список',
  yesNo: 'Да / Нет',
  rating: 'Оценка',
  number: 'Число',
  date: 'Дата',
  dateTime: 'Дата и время',
  time: 'Время',
};
