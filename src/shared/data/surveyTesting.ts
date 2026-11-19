// Captured with the local survey build and isolated API fixtures. Weights are illustrative.
export interface TestingZone {
  label: string
  x: number
  y: number
  width: number
  height: number
  weight: number
  hits: number
}

export interface TestingMap {
  image: string
  zones: TestingZone[]
  clicks: { x: number; y: number; n: number }[]
}

export interface TestingRun {
  id: string
  name: string
  maps: TestingMap[]
}

export const TESTING_SCENES: { id: string; title: string }[] = [
  {
    "id": "home",
    "title": "Главная"
  },
  {
    "id": "prompt",
    "title": "Запрос к ИИ"
  },
  {
    "id": "draft",
    "title": "Черновик от ИИ"
  },
  {
    "id": "editor",
    "title": "Конструктор"
  },
  {
    "id": "publish",
    "title": "Публикация"
  },
  {
    "id": "published",
    "title": "Ссылка участникам"
  },
  {
    "id": "results",
    "title": "Результаты"
  },
  {
    "id": "insights",
    "title": "ИИ-инсайты"
  }
]

export const TESTING_RUNS: TestingRun[] = [
  {
    id: "profile-1",
    name: "Профиль 1",
    maps: [
      {
        image: "profile-1-home.webp",
        zones: [
          {"label": "Новое исследование", "x": 1219.19, "y": 124.39, "width": 148.81, "height": 32, "weight": 48, "hits": 1},
          {"label": "Шаблон NPS", "x": 960.39, "y": 365.59, "width": 196.8, "height": 175, "weight": 8, "hits": 0},
          {"label": "Все шаблоны", "x": 1171.19, "y": 365.59, "width": 196.81, "height": 175, "weight": 7, "hits": 0},
          {"label": "Недавнее исследование", "x": 353, "y": 236.55, "width": 193.88, "height": 16.09, "weight": 23, "hits": 0},
          {"label": "Поиск в команде", "x": 16, "y": 66, "width": 240, "height": 40, "weight": 7, "hits": 0},
        ],
        clicks: [{"x": 1293, "y": 140, "n": 1}],
      },
      {
        image: "profile-1-prompt.webp",
        zones: [
          {"label": "Сообщение ИИ", "x": 485, "y": 891.2, "width": 678, "height": 38, "weight": 49, "hits": 1},
          {"label": "Отправить", "x": 1171, "y": 889.2, "width": 40, "height": 40, "weight": 31, "hits": 1},
        ],
        clicks: [{"x": 824, "y": 899, "n": 1}, {"x": 1191, "y": 909, "n": 1}],
      },
      {
        image: "profile-1-draft.webp",
        zones: [
          {"label": "Открыть черновик в конструкторе", "x": 1009, "y": 912, "width": 391, "height": 48, "weight": 59, "hits": 1},
          {"label": "Сообщение ИИ", "x": 309, "y": 891.2, "width": 590, "height": 38, "weight": 12, "hits": 0},
          {"label": "Отправить", "x": 907, "y": 889.2, "width": 40, "height": 40, "weight": 9, "hits": 0},
        ],
        clicks: [{"x": 1204, "y": 936, "n": 1}],
      },
      {
        image: "profile-1-editor.webp",
        zones: [
          {"label": "Название опроса", "x": 572, "y": 223, "width": 492, "height": 32, "weight": 16, "hits": 0},
          {"label": "Сохранить", "x": 1280.34, "y": 92, "width": 119.66, "height": 40, "weight": 19, "hits": 0},
          {"label": "Публикация", "x": 495.28, "y": 156, "width": 78.05, "height": 22, "weight": 38, "hits": 1},
        ],
        clicks: [{"x": 534, "y": 167, "n": 1}],
      },
      {
        image: "profile-1-publish.webp",
        zones: [
          {"label": "Опубликовать опрос", "x": 304, "y": 857.2, "width": 188.39, "height": 40, "weight": 64, "hits": 2},
          {"label": "Форма", "x": 304, "y": 232, "width": 80.77, "height": 22, "weight": 11, "hits": 0},
        ],
        clicks: [{"x": 398, "y": 877, "n": 2}],
      },
      {
        image: "profile-1-published.webp",
        zones: [
          {"label": "Копировать ссылку", "x": 959.86, "y": 883.59, "width": 144.14, "height": 40, "weight": 51, "hits": 1},
          {"label": "Поле ссылки", "x": 304, "y": 883.59, "width": 647.86, "height": 40, "weight": 14, "hits": 0},
          {"label": "Результаты", "x": 526.81, "y": 232, "width": 71.16, "height": 22, "weight": 26, "hits": 1},
          {"label": "Остановить приём ответов", "x": 304, "y": 947.59, "width": 228.56, "height": 40, "weight": 5, "hits": 0},
        ],
        clicks: [{"x": 1031, "y": 903, "n": 1}, {"x": 562, "y": 243, "n": 1}],
      },
      {
        image: "profile-1-results.webp",
        zones: [
          {"label": "ИИ-инсайты", "x": 572.59, "y": 282, "width": 80.19, "height": 22, "weight": 46, "hits": 1},
          {"label": "По вопросам", "x": 377.34, "y": 282, "width": 57.16, "height": 22, "weight": 37, "hits": 0},
          {"label": "Ответы", "x": 466.5, "y": 282, "width": 74.09, "height": 22, "weight": 17, "hits": 0},
        ],
        clicks: [{"x": 612, "y": 293, "n": 1}],
      },
      {
        image: "profile-1-insights.webp",
        zones: [
          {"label": "Вопрос, на котором основан вывод", "x": 386.67, "y": 652.98, "width": 347.5, "height": 20, "weight": 56, "hits": 1},
          {"label": "Обновить ИИ-резюме", "x": 1271.88, "y": 583.48, "width": 107.12, "height": 32, "weight": 11, "hits": 0},
          {"label": "По вопросам", "x": 377.34, "y": 282, "width": 57.16, "height": 22, "weight": 20, "hits": 0},
        ],
        clicks: [{"x": 560, "y": 662, "n": 1}],
      },
    ],
  },
  {
    id: "profile-2",
    name: "Профиль 2",
    maps: [
      {
        image: "profile-2-home.webp",
        zones: [
          {"label": "Новое исследование", "x": 1219.19, "y": 124.39, "width": 148.81, "height": 32, "weight": 48, "hits": 1},
          {"label": "Шаблон NPS", "x": 960.39, "y": 365.59, "width": 196.8, "height": 175, "weight": 10, "hits": 0},
          {"label": "Все шаблоны", "x": 1171.19, "y": 365.59, "width": 196.81, "height": 175, "weight": 13, "hits": 0},
          {"label": "Недавнее исследование", "x": 353, "y": 236.55, "width": 216.23, "height": 16.09, "weight": 15, "hits": 0},
          {"label": "Поиск в команде", "x": 16, "y": 66, "width": 240, "height": 40, "weight": 13, "hits": 0},
        ],
        clicks: [{"x": 1293, "y": 140, "n": 1}],
      },
      {
        image: "profile-2-prompt.webp",
        zones: [
          {"label": "Сообщение ИИ", "x": 485, "y": 869.2, "width": 678, "height": 60, "weight": 52, "hits": 1},
          {"label": "Отправить", "x": 1171, "y": 889.2, "width": 40, "height": 40, "weight": 27, "hits": 1},
        ],
        clicks: [{"x": 824, "y": 899, "n": 1}, {"x": 1191, "y": 909, "n": 1}],
      },
      {
        image: "profile-2-draft.webp",
        zones: [
          {"label": "Открыть черновик в конструкторе", "x": 1009, "y": 912, "width": 391, "height": 48, "weight": 48, "hits": 1},
          {"label": "Сообщение ИИ", "x": 309, "y": 891.2, "width": 590, "height": 38, "weight": 25, "hits": 0},
          {"label": "Отправить", "x": 907, "y": 889.2, "width": 40, "height": 40, "weight": 17, "hits": 0},
        ],
        clicks: [{"x": 1204, "y": 936, "n": 1}],
      },
      {
        image: "profile-2-editor.webp",
        zones: [
          {"label": "Название опроса", "x": 572, "y": 223, "width": 492, "height": 32, "weight": 31, "hits": 1},
          {"label": "Сохранить", "x": 1280.34, "y": 92, "width": 119.66, "height": 40, "weight": 18, "hits": 0},
          {"label": "Публикация", "x": 495.28, "y": 156, "width": 78.05, "height": 22, "weight": 36, "hits": 1},
        ],
        clicks: [{"x": 818, "y": 239, "n": 1}, {"x": 534, "y": 167, "n": 1}],
      },
      {
        image: "profile-2-publish.webp",
        zones: [
          {"label": "Опубликовать опрос", "x": 304, "y": 857.2, "width": 188.39, "height": 40, "weight": 51, "hits": 1},
          {"label": "Форма", "x": 304, "y": 232, "width": 80.77, "height": 22, "weight": 23, "hits": 0},
        ],
        clicks: [{"x": 398, "y": 877, "n": 1}],
      },
      {
        image: "profile-2-published.webp",
        zones: [
          {"label": "Копировать ссылку", "x": 959.86, "y": 883.59, "width": 144.14, "height": 40, "weight": 37, "hits": 1},
          {"label": "Поле ссылки", "x": 304, "y": 883.59, "width": 647.86, "height": 40, "weight": 17, "hits": 1},
          {"label": "Результаты", "x": 526.81, "y": 232, "width": 71.16, "height": 22, "weight": 37, "hits": 1},
          {"label": "Остановить приём ответов", "x": 304, "y": 947.59, "width": 228.56, "height": 40, "weight": 6, "hits": 0},
        ],
        clicks: [{"x": 1031, "y": 903, "n": 1}, {"x": 627, "y": 903, "n": 1}, {"x": 562, "y": 243, "n": 1}],
      },
      {
        image: "profile-2-results.webp",
        zones: [
          {"label": "ИИ-инсайты", "x": 572.59, "y": 282, "width": 80.19, "height": 22, "weight": 35, "hits": 1},
          {"label": "По вопросам", "x": 377.34, "y": 282, "width": 57.16, "height": 22, "weight": 52, "hits": 1},
          {"label": "Ответы", "x": 466.5, "y": 282, "width": 74.09, "height": 22, "weight": 15, "hits": 0},
        ],
        clicks: [{"x": 612, "y": 293, "n": 1}, {"x": 405, "y": 293, "n": 1}],
      },
      {
        image: "profile-2-insights.webp",
        zones: [
          {"label": "Вопрос, на котором основан вывод", "x": 386.67, "y": 652.98, "width": 267.41, "height": 20, "weight": 39, "hits": 1},
          {"label": "Обновить ИИ-резюме", "x": 1271.88, "y": 583.48, "width": 107.12, "height": 32, "weight": 20, "hits": 0},
          {"label": "По вопросам", "x": 377.34, "y": 282, "width": 57.16, "height": 22, "weight": 37, "hits": 0},
        ],
        clicks: [{"x": 520, "y": 662, "n": 1}],
      },
    ],
  },
  {
    id: "profile-3",
    name: "Профиль 3",
    maps: [
      {
        image: "profile-3-home.webp",
        zones: [
          {"label": "Новое исследование", "x": 1219.19, "y": 124.39, "width": 148.81, "height": 32, "weight": 44, "hits": 1},
          {"label": "Шаблон NPS", "x": 960.39, "y": 365.59, "width": 196.8, "height": 175, "weight": 15, "hits": 0},
          {"label": "Все шаблоны", "x": 1171.19, "y": 365.59, "width": 196.81, "height": 175, "weight": 19, "hits": 0},
          {"label": "Недавнее исследование", "x": 353, "y": 236.55, "width": 198.3, "height": 16.09, "weight": 12, "hits": 0},
          {"label": "Поиск в команде", "x": 16, "y": 66, "width": 240, "height": 40, "weight": 9, "hits": 0},
        ],
        clicks: [{"x": 1293, "y": 140, "n": 1}],
      },
      {
        image: "profile-3-prompt.webp",
        zones: [
          {"label": "Сообщение ИИ", "x": 485, "y": 869.2, "width": 678, "height": 60, "weight": 45, "hits": 1},
          {"label": "Отправить", "x": 1171, "y": 889.2, "width": 40, "height": 40, "weight": 37, "hits": 1},
        ],
        clicks: [{"x": 824, "y": 899, "n": 1}, {"x": 1191, "y": 909, "n": 1}],
      },
      {
        image: "profile-3-draft.webp",
        zones: [
          {"label": "Открыть черновик в конструкторе", "x": 1009, "y": 912, "width": 391, "height": 48, "weight": 53, "hits": 1},
          {"label": "Сообщение ИИ", "x": 309, "y": 891.2, "width": 590, "height": 38, "weight": 21, "hits": 0},
          {"label": "Отправить", "x": 907, "y": 889.2, "width": 40, "height": 40, "weight": 14, "hits": 0},
        ],
        clicks: [{"x": 1204, "y": 936, "n": 1}],
      },
      {
        image: "profile-3-editor.webp",
        zones: [
          {"label": "Название опроса", "x": 572, "y": 223, "width": 492, "height": 32, "weight": 22, "hits": 0},
          {"label": "Сохранить", "x": 1280.34, "y": 92, "width": 119.66, "height": 40, "weight": 21, "hits": 0},
          {"label": "Публикация", "x": 495.28, "y": 156, "width": 78.05, "height": 22, "weight": 31, "hits": 1},
        ],
        clicks: [{"x": 534, "y": 167, "n": 1}],
      },
      {
        image: "profile-3-publish.webp",
        zones: [
          {"label": "Опубликовать опрос", "x": 304, "y": 857.2, "width": 188.39, "height": 40, "weight": 58, "hits": 1},
          {"label": "Форма", "x": 304, "y": 232, "width": 80.77, "height": 22, "weight": 17, "hits": 0},
        ],
        clicks: [{"x": 398, "y": 877, "n": 1}],
      },
      {
        image: "profile-3-published.webp",
        zones: [
          {"label": "Копировать ссылку", "x": 959.86, "y": 883.59, "width": 144.14, "height": 40, "weight": 59, "hits": 1},
          {"label": "Поле ссылки", "x": 304, "y": 883.59, "width": 647.86, "height": 40, "weight": 15, "hits": 0},
          {"label": "Результаты", "x": 526.81, "y": 232, "width": 71.16, "height": 22, "weight": 19, "hits": 1},
          {"label": "Остановить приём ответов", "x": 304, "y": 947.59, "width": 228.56, "height": 40, "weight": 7, "hits": 0},
        ],
        clicks: [{"x": 1031, "y": 903, "n": 1}, {"x": 562, "y": 243, "n": 1}],
      },
      {
        image: "profile-3-results.webp",
        zones: [
          {"label": "ИИ-инсайты", "x": 572.59, "y": 282, "width": 80.19, "height": 22, "weight": 47, "hits": 1},
          {"label": "По вопросам", "x": 377.34, "y": 282, "width": 57.16, "height": 22, "weight": 23, "hits": 0},
          {"label": "Ответы", "x": 466.5, "y": 282, "width": 74.09, "height": 22, "weight": 30, "hits": 0},
        ],
        clicks: [{"x": 612, "y": 293, "n": 1}],
      },
      {
        image: "profile-3-insights.webp",
        zones: [
          {"label": "Вопрос, на котором основан вывод", "x": 386.67, "y": 652.98, "width": 211.75, "height": 20, "weight": 48, "hits": 1},
          {"label": "Обновить ИИ-резюме", "x": 1271.88, "y": 583.48, "width": 107.12, "height": 32, "weight": 17, "hits": 0},
          {"label": "По вопросам", "x": 377.34, "y": 282, "width": 57.16, "height": 22, "weight": 25, "hits": 0},
        ],
        clicks: [{"x": 492, "y": 662, "n": 1}],
      },
    ],
  },
  {
    id: "profile-4",
    name: "Профиль 4",
    maps: [
      {
        image: "profile-4-home.webp",
        zones: [
          {"label": "Новое исследование", "x": 1219.19, "y": 124.39, "width": 148.81, "height": 32, "weight": 42, "hits": 1},
          {"label": "Шаблон NPS", "x": 960.39, "y": 365.59, "width": 196.8, "height": 175, "weight": 5, "hits": 0},
          {"label": "Все шаблоны", "x": 1171.19, "y": 365.59, "width": 196.81, "height": 175, "weight": 12, "hits": 0},
          {"label": "Недавнее исследование", "x": 353, "y": 236.55, "width": 181.25, "height": 16.09, "weight": 24, "hits": 0},
          {"label": "Поиск в команде", "x": 16, "y": 66, "width": 240, "height": 40, "weight": 14, "hits": 0},
        ],
        clicks: [{"x": 1293, "y": 140, "n": 1}],
      },
      {
        image: "profile-4-prompt.webp",
        zones: [
          {"label": "Сообщение ИИ", "x": 485, "y": 869.2, "width": 678, "height": 60, "weight": 47, "hits": 1},
          {"label": "Отправить", "x": 1171, "y": 889.2, "width": 40, "height": 40, "weight": 34, "hits": 1},
        ],
        clicks: [{"x": 824, "y": 899, "n": 1}, {"x": 1191, "y": 909, "n": 1}],
      },
      {
        image: "profile-4-draft.webp",
        zones: [
          {"label": "Открыть черновик в конструкторе", "x": 1009, "y": 912, "width": 391, "height": 48, "weight": 54, "hits": 1},
          {"label": "Сообщение ИИ", "x": 309, "y": 891.2, "width": 590, "height": 38, "weight": 19, "hits": 0},
          {"label": "Отправить", "x": 907, "y": 889.2, "width": 40, "height": 40, "weight": 10, "hits": 0},
        ],
        clicks: [{"x": 1204, "y": 936, "n": 1}],
      },
      {
        image: "profile-4-editor.webp",
        zones: [
          {"label": "Название опроса", "x": 572, "y": 223, "width": 492, "height": 32, "weight": 27, "hits": 1},
          {"label": "Сохранить", "x": 1280.34, "y": 92, "width": 119.66, "height": 40, "weight": 28, "hits": 0},
          {"label": "Публикация", "x": 495.28, "y": 156, "width": 78.05, "height": 22, "weight": 35, "hits": 1},
        ],
        clicks: [{"x": 818, "y": 239, "n": 1}, {"x": 534, "y": 167, "n": 1}],
      },
      {
        image: "profile-4-publish.webp",
        zones: [
          {"label": "Опубликовать опрос", "x": 304, "y": 857.2, "width": 188.39, "height": 40, "weight": 61, "hits": 1},
          {"label": "Форма", "x": 304, "y": 232, "width": 80.77, "height": 22, "weight": 14, "hits": 0},
        ],
        clicks: [{"x": 398, "y": 877, "n": 1}],
      },
      {
        image: "profile-4-published.webp",
        zones: [
          {"label": "Копировать ссылку", "x": 959.86, "y": 883.59, "width": 144.14, "height": 40, "weight": 43, "hits": 0},
          {"label": "Поле ссылки", "x": 304, "y": 883.59, "width": 647.86, "height": 40, "weight": 16, "hits": 0},
          {"label": "Результаты", "x": 526.81, "y": 232, "width": 71.16, "height": 22, "weight": 34, "hits": 1},
          {"label": "Остановить приём ответов", "x": 304, "y": 947.59, "width": 228.56, "height": 40, "weight": 7, "hits": 0},
        ],
        clicks: [{"x": 562, "y": 243, "n": 1}],
      },
      {
        image: "profile-4-results.webp",
        zones: [
          {"label": "ИИ-инсайты", "x": 572.59, "y": 282, "width": 80.19, "height": 22, "weight": 36, "hits": 1},
          {"label": "По вопросам", "x": 377.34, "y": 282, "width": 57.16, "height": 22, "weight": 26, "hits": 0},
          {"label": "Ответы", "x": 466.5, "y": 282, "width": 74.09, "height": 22, "weight": 44, "hits": 1},
        ],
        clicks: [{"x": 612, "y": 293, "n": 1}, {"x": 503, "y": 293, "n": 1}],
      },
      {
        image: "profile-4-insights.webp",
        zones: [
          {"label": "Вопрос, на котором основан вывод", "x": 386.67, "y": 652.98, "width": 276.25, "height": 20, "weight": 52, "hits": 1},
          {"label": "Обновить ИИ-резюме", "x": 1271.88, "y": 583.48, "width": 107.12, "height": 32, "weight": 12, "hits": 0},
          {"label": "По вопросам", "x": 377.34, "y": 282, "width": 57.16, "height": 22, "weight": 30, "hits": 0},
        ],
        clicks: [{"x": 524, "y": 662, "n": 1}],
      },
    ],
  },
  {
    id: "overview",
    name: "Сводная карта",
    maps: [
      {
        image: "profile-3-home.webp",
        zones: [
          {"label": "Новое исследование", "x": 1219.19, "y": 124.39, "width": 148.81, "height": 32, "weight": 45.5, "hits": 4},
          {"label": "Шаблон NPS", "x": 960.39, "y": 365.59, "width": 196.8, "height": 175, "weight": 9.5, "hits": 0},
          {"label": "Все шаблоны", "x": 1171.19, "y": 365.59, "width": 196.81, "height": 175, "weight": 12.75, "hits": 0},
          {"label": "Недавнее исследование", "x": 353, "y": 236.55, "width": 198.3, "height": 16.09, "weight": 18.5, "hits": 0},
          {"label": "Поиск в команде", "x": 16, "y": 66, "width": 240, "height": 40, "weight": 10.75, "hits": 0},
        ],
        clicks: [{"x": 1294, "y": 140, "n": 4}],
      },
      {
        image: "profile-3-prompt.webp",
        zones: [
          {"label": "Сообщение ИИ", "x": 485, "y": 869.2, "width": 678, "height": 60, "weight": 48.25, "hits": 4},
          {"label": "Отправить", "x": 1171, "y": 889.2, "width": 40, "height": 40, "weight": 32.25, "hits": 4},
        ],
        clicks: [{"x": 824, "y": 899, "n": 4}, {"x": 1191, "y": 909, "n": 4}],
      },
      {
        image: "profile-3-draft.webp",
        zones: [
          {"label": "Открыть черновик в конструкторе", "x": 1009, "y": 912, "width": 391, "height": 48, "weight": 53.5, "hits": 4},
          {"label": "Сообщение ИИ", "x": 309, "y": 891.2, "width": 590, "height": 38, "weight": 19.25, "hits": 0},
          {"label": "Отправить", "x": 907, "y": 889.2, "width": 40, "height": 40, "weight": 12.5, "hits": 0},
        ],
        clicks: [{"x": 1204, "y": 936, "n": 4}],
      },
      {
        image: "profile-3-editor.webp",
        zones: [
          {"label": "Название опроса", "x": 572, "y": 223, "width": 492, "height": 32, "weight": 24.0, "hits": 2},
          {"label": "Сохранить", "x": 1280.34, "y": 92, "width": 119.66, "height": 40, "weight": 21.5, "hits": 0},
          {"label": "Публикация", "x": 495.28, "y": 156, "width": 78.05, "height": 22, "weight": 35.0, "hits": 4},
        ],
        clicks: [{"x": 818, "y": 239, "n": 2}, {"x": 534, "y": 167, "n": 4}],
      },
      {
        image: "profile-3-publish.webp",
        zones: [
          {"label": "Опубликовать опрос", "x": 304, "y": 857.2, "width": 188.39, "height": 40, "weight": 58.5, "hits": 5},
          {"label": "Форма", "x": 304, "y": 232, "width": 80.77, "height": 22, "weight": 16.25, "hits": 0},
        ],
        clicks: [{"x": 398, "y": 877, "n": 5}],
      },
      {
        image: "profile-3-published.webp",
        zones: [
          {"label": "Копировать ссылку", "x": 959.86, "y": 883.59, "width": 144.14, "height": 40, "weight": 47.5, "hits": 3},
          {"label": "Поле ссылки", "x": 304, "y": 883.59, "width": 647.86, "height": 40, "weight": 15.5, "hits": 1},
          {"label": "Результаты", "x": 526.81, "y": 232, "width": 71.16, "height": 22, "weight": 29.0, "hits": 4},
          {"label": "Остановить приём ответов", "x": 304, "y": 947.59, "width": 228.56, "height": 40, "weight": 6.25, "hits": 0},
        ],
        clicks: [{"x": 1032, "y": 904, "n": 3}, {"x": 628, "y": 904, "n": 1}, {"x": 562, "y": 243, "n": 4}],
      },
      {
        image: "profile-3-results.webp",
        zones: [
          {"label": "ИИ-инсайты", "x": 572.59, "y": 282, "width": 80.19, "height": 22, "weight": 41.0, "hits": 4},
          {"label": "По вопросам", "x": 377.34, "y": 282, "width": 57.16, "height": 22, "weight": 34.5, "hits": 1},
          {"label": "Ответы", "x": 466.5, "y": 282, "width": 74.09, "height": 22, "weight": 26.5, "hits": 1},
        ],
        clicks: [{"x": 613, "y": 293, "n": 4}, {"x": 406, "y": 293, "n": 1}, {"x": 504, "y": 293, "n": 1}],
      },
      {
        image: "profile-3-insights.webp",
        zones: [
          {"label": "Вопрос, на котором основан вывод", "x": 386.67, "y": 652.98, "width": 211.75, "height": 20, "weight": 48.75, "hits": 4},
          {"label": "Обновить ИИ-резюме", "x": 1271.88, "y": 583.48, "width": 107.12, "height": 32, "weight": 15.0, "hits": 0},
          {"label": "По вопросам", "x": 377.34, "y": 282, "width": 57.16, "height": 22, "weight": 28.0, "hits": 0},
        ],
        clicks: [{"x": 493, "y": 663, "n": 4}],
      },
    ],
  },
]
