# Development Rules — СВОД

Дата: 2026-06-14

Документ фиксирует обязательные правила разработки проекта **СВОД** — B2B SaaS для сбора, структурирования и обработки заявок внутри организаций.

Связанные документы:

- [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) — обзор продукта, стек и бизнес-логика
- [FRONTEND_RULES.md](./FRONTEND_RULES.md)
- [BACKEND_RULES.md](./BACKEND_RULES.md)
- [API_RULES.md](./API_RULES.md)
- [REFACTORING_RULES.md](./REFACTORING_RULES.md)
- [FIGMA_MCP_RULES.md](./FIGMA_MCP_RULES.md)
- Cursor rules: `.cursor/rules/*.mdc`

---

## 1. Продуктовый контекст

### Назначение

СВОД помогает маркетологам, продактам и внутренним командам централизованно принимать запросы от коллег, партнёров, клиентов и стейкхолдеров.

### Ключевые сущности

| Сущность | Описание |
|----------|----------|
| Организация | Рабочее пространство, владелец, участники |
| Участник | Пользователь с ролью `owner` или `member` |
| Заявка | Запрос, созданный по форме |
| Форма | Шаблон полей для заявок |
| Публичная ссылка | Токенизированный доступ к форме без авторизации |
| Пользователь | Аккаунт с профилем и JWT-сессией |

### Основные разделы UI

- **Заявки** — `/requests`
- **Формы** — `/forms`
- **Участники** — `/participants`
- **Настройки организации** — `/settings/organization`

---

## 2. Технологический стек (approved)

### Frontend

| Слой | Технология |
|------|------------|
| Runtime | React 19, TypeScript 5.9 |
| Bundler | Vite 7 |
| UI | Ant Design 6, `@ant-design/icons` |
| Routing | React Router 7 (`createBrowserRouter`) |
| HTTP | axios |
| DnD (form-builder) | `@dnd-kit/*` |
| Icons (form-builder) | `@iconify/react` |
| Dates | `dayjs` |
| Стили | `brand-tokens.css`, `index.css`, CSS-переменные `--app-*` |

### Backend

| Слой | Технология |
|------|------------|
| Framework | FastAPI |
| ORM | SQLAlchemy async + asyncpg |
| Migrations | Alembic |
| Auth | JWT (`python-jose`) + bcrypt |
| Entry | `backend/app/main.py` |

### Команды frontend

```bash
npm run dev       # локальная разработка
npm run lint      # ESLint
npm run build     # tsc -b && vite build
npm run preview   # preview production build
```

Отдельных `npm run test` и `npm run typecheck` **нет**. Typecheck входит в `build`.

---

## 3. Архитектурные границы

### Frontend (`src/`)

```
src/
  pages/           # route-level screens
  components/      # layout, domain UI blocks
  shared/
    api/           # HTTP-модули по сущностям
    lib/           # axios client (api.ts)
    context/       # React context + providers
    hooks/         # useAuth, useOrganization, form store
    ui/            # reusable UI, form-builder
    utils/         # pure helpers
    types/         # shared TS types
    constants/
  types/           # domain DTO/types (author, request, form, …)
  assets/          # logo, favicon
```

### Backend (`backend/app/`)

```
routes/ → services/ → repositories/ → models/
schemas/  — Pydantic DTO
core/     — config, database, security
```

### Запрещённые изменения без отдельной задачи

- Глобальный refactor структуры папок
- Массовый перенос файлов
- Изменение auth flow (JWT + `localStorage.access_token`)
- Изменение маршрутов без согласования
- Изменение backend endpoints / response schema
- Database migrations без плана
- Удаление файлов без проверки импортов

---

## 4. Запрещённые технологии

**Не возвращать в проект:**

| Запрещено | Причина |
|-----------|---------|
| Carbon (`@carbon/*`, `--cds-*`) | Удалён, 0 совпадений в runtime |
| Supabase (`@supabase/supabase-js`, Supabase clients) | Удалён из deps, auth через FastAPI JWT |
| zustand | Удалён, form state через React context |
| Новые UI-библиотеки | Ant Design — единственная DS |

При обнаружении остатков:

1. Проверить реальное использование (`grep`, импорты).
2. Если мёртвый код — удалить.
3. Если используется — заменить на approved stack.
4. Зафиксировать в отчёте задачи.

**Legacy:** папка `supabase/` с SQL-файлами не используется runtime-кодом. Не подключать обратно.

---

## 5. Auth flow (не ломать)

1. `POST /auth/login` или `POST /auth/register` → `access_token` в `localStorage`.
2. Axios interceptor (`src/shared/lib/api.ts`) добавляет `Authorization: Bearer`.
3. `AuthProvider` загружает профиль через `GET /auth/me`.
4. 401 → очистка токена, redirect на `/auth`.
5. `OrganizationProvider` хранит `active_organization_id` в `localStorage`.

**Forgot password:** не реализован. Stub UI удалён. Не добавлять без backend (SMTP, reset token, endpoints).

---

## 6. Routing (актуальный)

| Path | Доступ |
|------|--------|
| `/auth` | Public |
| `/form/:token`, `/form/:token/fill/:formId` | Public |
| `/public/request/:token` | Public (legacy redirect) |
| `/`, `/requests`, `/forms`, `/participants`, `/settings/organization` | Protected |

Guard: `ProtectedLayout` → `useAuth().user` → иначе `/auth`.

Org gate: без организаций показывается empty state создания организации.

---

## 7. API layer

Вся HTTP-логика — в `src/shared/api/`. Клиент — `src/shared/lib/api.ts`.

Модули: `auth.api.ts`, `profiles.api.ts`, `forms.api.ts`, `requests.api.ts`, `organizations.api.ts`, `files.api.ts`, `public.api.ts`.

Подробности: [API_RULES.md](./API_RULES.md).

---

## 8. UI / Design system

- Ant Design 6 — основная библиотека.
- Токены: `src/brand-tokens.css` (`--app-*`, `--brand-*`).
- Layout: CSS Grid shell (`.app-shell-grid`), не Ant `Layout`.
- Figma — источник истины для визуала. Подробности: [FIGMA_MCP_RULES.md](./FIGMA_MCP_RULES.md).
- Тексты интерфейса — на русском.

---

## 9. ESLint и TypeScript

Обязательно перед завершением задачи:

```bash
npm run lint    # 0 errors, 0 warnings
npm run build   # tsc -b + vite build
```

Правила:

- Не использовать `any` → `unknown` + type guard.
- Не отключать ESLint массово (`eslint-disable`).
- Не оставлять `console.log`, `debugger`, неиспользуемые импорты.
- Особое внимание: `exhaustive-deps`, `no-explicit-any`, `react-refresh`, `set-state-in-effect`.

---

## 10. Quality gates и отчёт по задаче

### Проверки

| Команда | Обязательность |
|---------|----------------|
| `npm run lint` | Да |
| `npm run build` | Да |
| `npm run test` | Нет (script отсутствует) |
| Backend lint/test | Только если backend затронут |

### Финальный отчёт

1. Что изменено и зачем.
2. Список изменённых / добавленных / удалённых файлов.
3. Результаты проверок (lint, build).
4. Оставшиеся риски и follow-up.

---

## 11. Cursor rules

AI-ассистент должен следовать `.cursor/rules/*.mdc`:

| Файл | Scope |
|------|-------|
| `project-context.mdc` | alwaysApply |
| `quality-gates.mdc` | alwaysApply |
| `frontend.mdc` | `src/**/*.{ts,tsx}` |
| `backend.mdc` | `backend/**/*` |
| `api-layer.mdc` | `src/shared/api/**`, consumers |
| `ui-design-system.mdc` | UI, CSS |
| `refactoring.mdc` | refactor tasks |
| `figma-mcp.mdc` | Figma implementation |

---

## 12. История рефакторинга

См. `REFACTOR_PLAN.md`, `REFACTOR_REPORT.md`:

- Удалены: Supabase JS, zustand, `requestService.ts`, forgot-password stubs.
- Консолидирован: `getRequestWithForm` → `requests.api.ts`.
- ESLint: 0 errors, 0 warnings (после follow-up cleanup).
- Carbon: 0 совпадений.
