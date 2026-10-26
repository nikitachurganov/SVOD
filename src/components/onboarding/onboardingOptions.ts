/** Choices of the first-visit questionnaire; the values are the ones the server accepts */

export interface ChoiceOption {
  value: string;
  label: string;
}

export const OTHER_VALUE = 'other';

export const OCCUPATION_OPTIONS: ChoiceOption[] = [
  { value: 'student', label: 'Студент' },
  { value: 'researcher', label: 'Исследователь, учёный' },
  { value: 'marketer', label: 'Маркетолог, аналитик' },
  { value: 'hr', label: 'HR-специалист' },
  { value: 'teacher', label: 'Преподаватель' },
  { value: 'business', label: 'Предприниматель, руководитель' },
  { value: OTHER_VALUE, label: 'Другое' },
];

export const PURPOSE_OPTIONS: ChoiceOption[] = [
  { value: 'study', label: 'Учёба' },
  { value: 'science', label: 'Научное исследование' },
  { value: 'marketing', label: 'Маркетинг и исследование рынка' },
  { value: 'hr', label: 'Опросы сотрудников (HR)' },
  { value: 'customer_service', label: 'Обратная связь от клиентов' },
  { value: 'events', label: 'Мероприятия и регистрации' },
  { value: OTHER_VALUE, label: 'Другое' },
];

export const SOURCE_OPTIONS: ChoiceOption[] = [
  { value: 'search', label: 'Поиск в интернете' },
  { value: 'recommendation', label: 'Рекомендация знакомых' },
  { value: 'social', label: 'Соцсети' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'blog', label: 'Статья или блог' },
  { value: 'university', label: 'Университет, преподаватель' },
  { value: 'ads', label: 'Реклама' },
  { value: OTHER_VALUE, label: 'Другое' },
];
