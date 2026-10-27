/**
 * The guided tour: the path of a new person from a project to the analysis of answers.
 *
 * A step is shown on its own screen (`isHere`), highlights the first of its `targets` that is on the
 * page, and moves on by itself when the person does the thing (see TourProvider), or by «Далее».
 */

export type TourStepId =
  | 'project'
  | 'survey'
  | 'builder'
  | 'save'
  | 'publish'
  | 'share'
  | 'demo'
  | 'responses-tab'
  | 'responses'
  | 'analytics-tab'
  | 'ai-summary'
  | 'finish';

/** What the person has made on the way; the later steps need it to find their screen */
export interface TourData {
  projectId?: string;
  surveyId?: string;
}

export interface TourStepConfig {
  id: TourStepId;
  title: string;
  description: string;
  /** CSS selectors, the first one found on the page is highlighted; none found — the card is centred */
  targets: string[];
  /** The screen the step belongs to; elsewhere the tour offers to go back */
  isHere: (path: string, data: TourData) => boolean;
  /** Where «go back» leads */
  resumePath: (data: TourData) => string;
  /** The step has its own «Далее» button (nothing the person does moves it on) */
  manualNext?: boolean;
  /** Moves on when the highlighted element goes away (a window was closed), or was never there */
  advanceWhenGone?: boolean;
  /** The person works on the whole screen during the step: no dimming, only an outline on the target */
  freeInteraction?: boolean;
}

export const TOUR_START_PATH = '/surveys';

const surveyPath = (data: TourData) => `/surveys/${data.surveyId ?? ''}`;
const onSurvey = (path: string, data: TourData) =>
  !!data.surveyId && (path === surveyPath(data) || path.startsWith(`${surveyPath(data)}/`));

export const TOUR_STEPS: TourStepConfig[] = [
  {
    id: 'project',
    title: 'Создайте проект',
    description:
      'Проект — это папка для опросов одной темы. Нажмите «Новый проект», придумайте название и нажмите «Создать».',
    // The whole window while it is open, so that its fields stay usable
    targets: ['.tour-project-modal .ant-modal', '[data-tour="new-project"]'],
    isHere: (path) => path === '/surveys',
    resumePath: () => TOUR_START_PATH,
  },
  {
    id: 'survey',
    title: 'Создайте опрос',
    description: 'Проект готов. Теперь добавим в него опрос: нажмите «Создать опрос».',
    targets: ['[data-tour="create-survey"]'],
    isHere: (path, data) => path === `/surveys/projects/${data.projectId ?? ''}`,
    resumePath: (data) => `/surveys/projects/${data.projectId ?? ''}`,
  },
  {
    id: 'builder',
    title: 'Соберите вопросы',
    description:
      'Откройте «ИИ-конструктор» и опишите, что хотите узнать, — он предложит вопросы. Вопросы можно добавлять и вручную. Когда опрос готов, нажмите «Далее».',
    targets: ['[data-tour="ai-builder"]'],
    isHere: (path) => path === '/surveys/create',
    resumePath: (data) => `/surveys/create?project=${data.projectId ?? ''}`,
    manualNext: true,
    freeInteraction: true,
  },
  {
    id: 'save',
    title: 'Сохраните опрос',
    description: 'Нажмите «Сохранить» — опрос появится в проекте как черновик.',
    targets: ['[data-tour="save-survey"]'],
    isHere: (path) => path === '/surveys/create',
    resumePath: (data) => `/surveys/create?project=${data.projectId ?? ''}`,
    freeInteraction: true,
  },
  {
    id: 'publish',
    title: 'Опубликуйте опрос',
    description:
      'Пока опрос в черновиках, ссылка для респондентов не работает. Нажмите «Поделиться», затем «Опубликовать».',
    targets: ['.tour-share-modal .ant-modal', '[data-tour="share-survey"]'],
    isHere: onSurvey,
    resumePath: surveyPath,
  },
  {
    id: 'share',
    title: 'Ссылка для респондентов',
    description:
      'Опрос опубликован! Эту ссылку можно отправить кому угодно — регистрация не нужна. Скопируйте её и закройте окно.',
    targets: ['.tour-share-modal .ant-modal'],
    isHere: onSurvey,
    resumePath: surveyPath,
    advanceWhenGone: true,
  },
  {
    id: 'demo',
    title: 'Получите ответы',
    description:
      'Настоящие ответы придут, когда респонденты пройдут опрос. Чтобы не ждать, нажмите «Сгенерировать тестовые ответы» — мы создадим 25 правдоподобных ответов.',
    targets: ['[data-tour="demo-responses"]'],
    isHere: onSurvey,
    resumePath: surveyPath,
  },
  {
    id: 'responses-tab',
    title: 'Посмотрите ответы',
    description: 'Откройте вкладку «Ответы»: здесь каждый ответ можно открыть и прочитать.',
    targets: ['[data-tour="tab-responses"]'],
    isHere: onSurvey,
    resumePath: surveyPath,
  },
  {
    id: 'responses',
    title: 'Ответы респондентов',
    description:
      'Здесь все ответы списком. Откройте любой, чтобы увидеть его целиком, или скачайте всё в CSV. Дальше — самое интересное: аналитика.',
    targets: [],
    isHere: (path, data) => !!data.surveyId && path.startsWith(`${surveyPath(data)}/responses`),
    resumePath: (data) => `${surveyPath(data)}/responses`,
    manualNext: true,
  },
  {
    id: 'analytics-tab',
    title: 'Откройте аналитику',
    description: 'Перейдите на вкладку «Аналитика»: ответы уже собраны в графики.',
    targets: ['[data-tour="tab-analytics"]'],
    isHere: onSurvey,
    resumePath: surveyPath,
  },
  {
    id: 'ai-summary',
    title: 'Выводы за вас',
    description:
      'Здесь графики по каждому вопросу. Нажмите «Сформировать ИИ-резюме» — ИИ коротко перескажет главное, а кнопка «Спросить ИИ» вверху ответит на ваши вопросы по результатам. Когда посмотрите, нажмите «Далее».',
    targets: ['[data-tour="ai-summary"]'],
    isHere: (path, data) => !!data.surveyId && path === `${surveyPath(data)}/analytics`,
    resumePath: (data) => `${surveyPath(data)}/analytics`,
    manualNext: true,
  },
  {
    id: 'finish',
    title: 'Готово!',
    description:
      'Вы прошли весь путь: от проекта до анализа ответов. Тестовые ответы можно удалить, чтобы они не смешивались с настоящими, когда опрос пойдёт к респондентам.',
    targets: [],
    isHere: () => true,
    resumePath: (data) => (data.surveyId ? surveyPath(data) : TOUR_START_PATH),
  },
];

export const getTourStep = (id: TourStepId): TourStepConfig =>
  TOUR_STEPS.find((step) => step.id === id) ?? TOUR_STEPS[0];

export const tourStepNumber = (id: TourStepId): number =>
  TOUR_STEPS.findIndex((step) => step.id === id) + 1;

export const nextTourStep = (id: TourStepId): TourStepId | null => {
  const index = TOUR_STEPS.findIndex((step) => step.id === id);
  return TOUR_STEPS[index + 1]?.id ?? null;
};

/** Steps from «publish» on need the survey's id; «survey» and the builder steps need the project's */
export const hasTourData = (id: TourStepId, data: TourData): boolean => {
  const order = TOUR_STEPS.findIndex((step) => step.id === id);
  if (order >= TOUR_STEPS.findIndex((step) => step.id === 'publish')) return !!data.surveyId;
  if (order >= TOUR_STEPS.findIndex((step) => step.id === 'survey')) return !!data.projectId;
  return true;
};
