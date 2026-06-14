# Refactoring Rules — СВОД

## Когда нужен рефакторинг

- Дублирование API-логики вне `shared/api`
- Мёртвый код (0 импортов)
- ESLint/TS ошибки, блокирующие build
- Явная задача в backlog / REFACTOR_PLAN

## Когда рефакторинг НЕ нужен

- «Заодно поправлю» при feature-задаче
- Массовое переименование без причины
- Смена дизайна под видом refactor
- Одновременный refactor frontend + backend без плана

## Процесс

### Перед

1. Прочитать текущую реализацию и все импорты (`grep`, IDE).
2. Оценить blast radius (pages, API, types, tests).
3. Зафиксировать план в комментарии к задаче или `REFACTOR_PLAN.md`.
4. Делить на этапы: deps → move → update imports → delete → verify.

### Во время

- Маленькие атомарные шаги.
- Один этап — одна цель (например, только consolidation API).
- Не менять поведение без явного требования.
- Не трогать unrelated modules.

### После

```bash
npm run lint    # 0 errors, 0 warnings
npm run build
```

Если backend затронут:

```bash
python -c "from app.main import app"
```

Обновить `REFACTOR_REPORT.md` или отчёт задачи.

## Уже выполненный refactor (не откатывать)

| Изменение | Статус |
|-----------|--------|
| Удалён `@supabase/supabase-js` | Done |
| Удалён `zustand`, `forms.store.ts` | Done |
| Удалён `requestViewModel.ts` | Done |
| `requestService.ts` → `requests.api.ts` | Done |
| Forgot-password stubs удалены | Done |
| Context split: `auth.context.ts` + `auth.provider.tsx` | Done |
| Form store split: hooks + FormProvider | Done |
| ESLint 0 errors, 0 warnings | Done |

## Запрещено при рефакторинге

- Возврат Carbon / Supabase / zustand
- `eslint-disable` вместо исправления
- Удаление файлов без `grep` на импорты
- Изменение routes, auth, DB без задачи
- Глобальный reformat всего проекта

## Проверка мёртвого кода

```bash
# пример: найти импорты файла
rg "requestService" src/
rg "from.*MyModule" src/
```

Если 0 импортов и файл не entry point — кандидат на удаление.

## Dual type layers

Сейчас существуют:

- `src/types/` — domain types
- `src/shared/types/` — form-builder, yandex-maps

Унификация — отдельная низкоприоритетная задача. Не смешивать без плана.

## Legacy supabase/

Папка `supabase/` с SQL-файлами не используется. При refactor — удалить, не восстанавливать.

## Отчёт по refactor-задаче

```md
## Refactor: [название]

### Цель
### Было / Стало
### Удалённые файлы
### Обновлённые импорты
### Проверки (lint, build)
### Риски
```
