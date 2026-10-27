import type { FormPageInstance } from '../types/form-builder.types';

/** Pages of a new survey: a greeting without questions, then an empty page for the questions */
export const createInitialSurveyPages = (): FormPageInstance[] => [
  {
    id: crypto.randomUUID(),
    title: 'Приветствие',
    fields: [
      {
        id: crypto.randomUUID(),
        type: 'textBlock',
        label: 'Добро пожаловать!',
        description:
          'Спасибо, что согласились принять участие в исследовании! ' +
          'Расскажите, о чём опрос, сколько он займёт времени и что ответы анонимны.',
        required: false,
      },
    ],
  },
  { id: crypto.randomUUID(), title: 'Страница 2', fields: [] },
];
