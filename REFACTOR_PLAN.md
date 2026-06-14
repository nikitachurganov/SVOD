# Refactor Plan — СВОД

## 1. Цель

Зафиксировать текущее состояние frontend + backend, безопасно очистить проект от legacy-интеграций (Carbon уже удалён, Supabase — мёртвый хвост), убрать неиспользуемые npm-зависимости и очевидный мёртвый код без изменения бизнес-логики, auth, роутинга и API.

## 2. Обнаруженные проблемы

### Архитектура

- **Frontend**: Vite 7 + React 19 + TypeScript, Ant Design 6, React Router 7
- **Backend**: FastAPI + SQLAlchemy async + Alembic + JWT (`python-jose`)
- **Auth**: `localStorage.access_token` → axios interceptor → `POST /auth/login`, `GET /auth/me` — **не Supabase**
- **Env**: только `VITE_API_URL` в `.env.example`; backend — `backend/.env.example`
- **Deploy**: `vercel.json` SPA rewrite

### Carbon — статус: полностью удалён

Глобальный grep по `carbon`, `@carbon`, `--cds-` — **0 совпадений** в репозитории. Миграция на Ant Design завершена ранее.

### Supabase — статус: не используется в runtime

| Артефакт | Найден | Используется |
|----------|--------|--------------|
| `@supabase/supabase-js` в `package.json` | да | **нет** (0 импортов в `src/`) |
| `supabase/*.sql` (3 файла) | да | **нет** (legacy SQL для Supabase Auth/RLS) |
| env `SUPABASE_*` | нет | — |
| backend | нет | FastAPI JWT |

### Мёртвый код

| Файл | Причина |
|------|---------|
| `src/shared/store/forms.store.ts` | zustand-store, 0 импортов |
| `src/services/requestViewModel.ts` | ~288 строк, 0 импортов |
| `supabase/` | legacy SQL |

### Живой, но дублирующий код (не удалять на этом этапе)

- `src/services/requestService.ts` — используется только в `RequestViewPage.tsx`
- Два слоя типов: `src/types/*` и `src/shared/types/*` — оба активно импортируются

### Lint / качество

- `npm run build` — проходит
- `npm run lint` — ~23 ошибки (pre-existing): `set-state-in-effect`, `react-refresh/only-export-components`, `no-explicit-any`
- `npm run test` / `typecheck` — отсутствуют как отдельные scripts (`tsc -b` внутри `build`)

---

## 3. Зависимости к удалению

| Dependency | Где используется | Статус | Действие | Риск |
|------------|------------------|--------|----------|------|
| `@supabase/supabase-js` | только package.json | мёртвая | `npm uninstall` | низкий |
| `zustand` | только `forms.store.ts` | мёртвая | удалить store + `npm uninstall` | низкий |
| `@carbon/*` | — | уже удалена | ничего | — |
| `@dnd-kit/*` | form-builder | живая | оставить | — |
| `@iconify/react` | DraggableFieldItem | живая | оставить | — |
| `dayjs` | FormPreviewModal | живая | оставить | — |

---

## 4. Carbon cleanup

**Действий не требуется.** Carbon полностью удалён из кода, стилей и `package.json`.

---

## 5. Supabase cleanup

Полное удаление:

1. `npm uninstall @supabase/supabase-js`
2. Удалить папку `supabase/` (3 SQL-файла)
3. Проверить `.env.example` — переменных Supabase нет
4. Grep-проверка: `supabase`, `SUPABASE`, `createClient` → 0 в runtime-коде

Auth остаётся на FastAPI JWT — не менять `auth.api.ts` / `auth.context.tsx`.

---

## 6. UI cleanup после перехода на Ant Design

Минимальная очистка на этом этапе:

- Удалить мёртвые CSS-классы, если останутся после удаления файлов
- **Не менять** тему Ant Design, layout Figma, `brand-tokens.css`
- Inline styles на auth-страницах — оставить (вне scope)

---

## 7. Структурный рефакторинг (follow-up)

| Задача | Приоритет | Почему отложено |
|--------|-----------|-----------------|
| Объединить `requestService` → `shared/api` | низкий | 1 потребитель, работает |
| Объединить `src/types` + `src/shared/types` | низкий | массовый import churn |
| Исправить 23 ESLint errors | средний | не связано с deps cleanup |
| Реализовать forgot-password на backend или убрать stub-страницы | низкий | бизнес-решение |

---

## 8. План выполнения по этапам

### Этап A — Документация
- Создать `REFACTOR_PLAN.md`
- Создать `REFACTOR_REPORT.md` после выполнения

### Этап B — Supabase cleanup
1. `npm uninstall @supabase/supabase-js`
2. Удалить `supabase/` целиком
3. `npm install`
4. Grep: supabase → 0 в src/backend

### Этап C — Zustand cleanup
1. Удалить `src/shared/store/forms.store.ts`
2. `npm uninstall zustand`

### Этап D — Мёртвый код
1. Удалить `src/services/requestViewModel.ts`
2. Grep подтверждение 0 ссылок

### Этап E — Проверки
```bash
npm install
npm run build
npm run lint
```

### Этап F — Отчёт
- Создать `REFACTOR_REPORT.md`

---

## 9. Проверки после каждого этапа

| Этап | Команда | Ожидание |
|------|---------|----------|
| B, C, D | `npm run build` | exit 0 |
| B, C, D | `npm run lint` | без новых ошибок |
| B | grep supabase | 0 в src/backend |
| C | grep zustand | 0 |
| D | grep requestViewModel | 0 |

---

## 10. Риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| depcheck ложно помечает `@iconify/react` | низкая | ручная проверка импортов |
| Удаление `requestViewModel.ts` нужен позже | низкая | git history |
| Lint errors останутся | высокая | зафиксировать в отчёте как follow-up |
| ForgotPassword бросает Error (backend TODO) | известно | не трогать в этом рефакторинге |

---

## 11. Итоговый чеклист

- [x] `REFACTOR_PLAN.md` создан
- [x] `@supabase/supabase-js` удалён из package.json + lock
- [x] `supabase/` удалён
- [x] `zustand` + `forms.store.ts` удалены
- [x] `requestViewModel.ts` удалён
- [x] Carbon = 0 (подтверждено)
- [x] `npm run build` успешен
- [x] `npm run lint` запущен, результат в отчёте
- [x] `REFACTOR_REPORT.md` создан
- [x] Backend не изменён
