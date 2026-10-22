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

export const formatP = (p: number): string => (p < 0.0001 ? '< 0,0001' : formatNumber(p));

const OTHER_PREFIX = '__other__:';

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
  if (typeof value === 'object') return JSON.stringify(value);
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
