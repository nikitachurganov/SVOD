# Refactor Report — СВОД

Дата: 2026-06-14

## 1. Что было найдено

### Архитектура
- Frontend: Vite + React 19 + TypeScript + Ant Design 6
- Backend: FastAPI + PostgreSQL + JWT auth (без Supabase)
- Auth: axios → `POST /auth/login`, токен в `localStorage`

### Legacy-интеграции
| Интеграция | Статус до рефакторинга | Статус после |
|------------|------------------------|--------------|
| Carbon UI | уже удалён (0 совпадений) | 0 совпадений |
| Supabase JS | в `package.json`, 0 импортов в `src/` | **удалён** |
| Supabase SQL | 3 файла в `supabase/` | **удалены** |
| zustand | только `forms.store.ts`, 0 импортов | **удалён** |

### Мёртвый код
- `src/services/requestViewModel.ts` — 288 строк, 0 импортов → удалён
- `src/shared/store/forms.store.ts` — zustand store, 0 импортов → удалён

---

## 2. Что было удалено

### Зависимости из `package.json`
| Пакет | Версия (была) | Причина удаления |
|-------|---------------|------------------|
| `@supabase/supabase-js` | ^2.98.0 | 0 импортов в runtime-коде |
| `zustand` | ^5.0.11 | единственный потребитель `forms.store.ts` не использовался |

Всего удалено **11 транзитивных пакетов** Supabase + **1** zustand (npm audit: 278 → 277 packages).

### Файлы
| Файл | Тип |
|------|-----|
| `supabase/setup-storage.sql` | legacy Supabase Storage RLS |
| `supabase/add-auth-profiles.sql` | legacy Supabase Auth profiles |
| `supabase/add-requests-closed-at.sql` | legacy Supabase migration |
| `src/shared/store/forms.store.ts` | неиспользуемый zustand store |
| `src/services/requestViewModel.ts` | неиспользуемый view-model (~288 строк) |

### Папки
- `supabase/` — удалена (пустая после удаления SQL-файлов)
- `src/shared/store/` — удалена (пустая после удаления store)

---

## 3. Что было изменено

| Файл | Изменение |
|------|-----------|
| `package.json` | удалены `@supabase/supabase-js`, `zustand` |
| `package-lock.json` | обновлён автоматически через `npm uninstall` |
| `REFACTOR_PLAN.md` | создан (план рефакторинга) |
| `REFACTOR_REPORT.md` | создан (этот отчёт) |

**Backend не изменялся.**

---

## 4. Carbon — итог

- Grep по `carbon`, `@carbon`, `--cds-` → **0 совпадений**
- Зависимостей Carbon в `package.json` нет
- **Carbon полностью удалён ранее, подтверждено аудитом**

---

## 5. Supabase — итог

- `@supabase/supabase-js` удалён из `package.json` и lock-файла
- Папка `supabase/` с legacy SQL удалена
- Grep по `supabase`, `SUPABASE`, `createClient` в `src/`, `backend/`, конфигах → **0 совпадений**
- Env-переменных Supabase не было в `.env.example`
- Auth работает через FastAPI JWT — **не затронут**

---

## 6. Оставшиеся зависимости (подтверждены как используемые)

| Пакет | Где используется |
|-------|------------------|
| `antd`, `@ant-design/icons` | layout, pages, form-builder |
| `axios` | `src/shared/lib/api.ts` |
| `react-router-dom` | `src/App.tsx` |
| `@dnd-kit/*` | form-builder (6 файлов) |
| `@iconify/react` | `DraggableFieldItem.tsx` + `ToolPanel.tsx` |
| `dayjs` | `FormPreviewModal.tsx` |

---

## 7. Оставшиеся риски и follow-up

| Задача | Приоритет | Комментарий |
|--------|-----------|-------------|
| 14 ESLint warnings (`exhaustive-deps`) | низкий | pre-existing, не блокируют build |
| `src/types` + `src/shared/types` | низкий | два слоя типов, оба активны |
| Восстановление пароля | средний | требует backend: SMTP, reset token, endpoints — см. раздел «Follow-up cleanup» |
| npm audit 11 vulnerabilities | низкий | не в scope рефакторинга |

---

## Follow-up cleanup

Дата: 2026-06-13

### ESLint
- Было ошибок: **20** (+ 15 warnings)
- Исправлено: **20** (`set-state-in-effect`, `no-explicit-any`, `react-refresh/only-export-components`)
- Оставшиеся ошибки: **0**
- Оставшиеся warnings: **14** (`react-hooks/exhaustive-deps`, pre-existing)

### requestService consolidation
- Старый файл: `src/services/requestService.ts`
- Новый модуль: `src/shared/api/requests.api.ts` (`getRequestWithForm`, `RequestWithForm`)
- Обновленные импорты: `src/pages/RequestViewPage.tsx`
- Удаленные файлы: `src/services/requestService.ts`

### Forgot password
- Найден backend flow: **нет** (нет endpoints `/auth/forgot-password`, `/auth/reset-password`, SMTP/env для email, таблицы reset token)
- Принятое решение: **убрать stub UI и API-заглушки**
- Что изменено:
  - удалены `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`
  - убраны маршруты `/auth/forgot-password`, `/auth/reset-password` из `App.tsx`
  - убрана ссылка «Забыли пароль?» с `AuthPage.tsx`
  - удалены `requestPasswordReset`, `updatePassword` из `auth.api.ts`
- Что осталось на будущее:
  - backend: `POST /auth/forgot-password`, `POST /auth/reset-password`, хранение hash токена, срок жизни, одноразовое использование, email service
  - frontend: формы forgot/reset через `shared/api` после появления backend

### Verification
- lint: **exit 0** — 0 errors, 14 warnings
- typecheck: входит в `npm run build` (`tsc -b`) — **exit 0**
- build: **exit 0**
- tests: отдельного script нет

---

## 8. Проверки

| Команда | Результат |
|---------|-----------|
| `npm uninstall @supabase/supabase-js` | exit 0, removed 10 packages |
| `npm uninstall zustand` | exit 0, removed 1 package |
| `npm run build` | **exit 0** — TypeScript + Vite build успешен |
| `npm run lint` | **exit 0** — 0 errors, 14 warnings (follow-up cleanup) |
| `grep supabase/zustand/carbon/requestViewModel` | **0 совпадений** в runtime-коде |
| `python -c "import app.main"` (backend) | не запускался — требует активированный `.venv` с `requirements.txt`; backend **не изменялся** |

Отдельных scripts `typecheck` и `test` в проекте нет (`tsc -b` входит в `build`).

---

## 9. Как проверить локально

```bash
cd c:\Users\Nikit\Desktop\SVOD
npm install
npm run build
npm run dev
```

Открыть http://localhost:5173 → авторизация → `/requests`. Убедиться, что sidebar, таблица заявок и profile dropdown работают.

Backend (отдельно):
```bash
cd backend
# активировать .venv
uvicorn app.main:app --reload --port 8000
```

---

## 10. Итоговый чеклист

- [x] `REFACTOR_PLAN.md` создан
- [x] `@supabase/supabase-js` удалён из package.json + lock
- [x] `supabase/` удалён
- [x] `zustand` + `forms.store.ts` удалены
- [x] `requestViewModel.ts` удалён
- [x] Carbon = 0 (подтверждено)
- [x] `npm run build` успешен
- [x] `npm run lint` запущен, результат зафиксирован
- [x] `REFACTOR_REPORT.md` создан
- [x] Backend не изменён

---

## Development rules added

Дата: 2026-06-14

- Added `docs/` development rules:
  - `DEVELOPMENT_RULES.md` — master document
  - `FRONTEND_RULES.md`, `BACKEND_RULES.md`, `API_RULES.md`
  - `REFACTORING_RULES.md`, `FIGMA_MCP_RULES.md`
- Added Cursor rules in `.cursor/rules/`:
  - `project-context.mdc` (alwaysApply)
  - `quality-gates.mdc` (alwaysApply)
  - `frontend.mdc`, `backend.mdc`, `api-layer.mdc`
  - `ui-design-system.mdc`, `refactoring.mdc`, `figma-mcp.mdc`
- Explicit ban on Carbon, Supabase, zustand in all rules
- Quality gates: `npm run lint` (0 errors/warnings) + `npm run build`
- Rules adapted to actual project structure (`shared/lib/api.ts`, 7 API modules, no test script)

---

## Form builder fields added

Дата: 2026-06-14

### Added fields
- `location`: Города и страны
- `rating`: Оценка по шкале
- `address`: Адрес с подсказками (расширен существующий тип)

### Schema changes
- `FormFieldType` расширен: `location`, `rating`
- В `FormFieldInstance` добавлено поле `config?: Record<string, unknown>` — настройки сохраняются в JSON схемы формы
- Типы конфигурации: `LocationFieldConfig`, `RatingFieldConfig`, `AddressFieldConfig` (`src/shared/types/field-config.types.ts`)
- Типы значений ответа: `LocationFieldValue`, `RatingFieldValue`, `AddressFieldValue` (`src/shared/types/field-values.types.ts`)
- Справочник стран/городов MVP: `src/shared/data/locations.ts` (заменяемый на backend API)

### API changes
- Frontend: `src/shared/api/suggestions.api.ts` — `suggestAddress(query, options)`
- Backend: `GET /suggest/address?query=...&provider=dadata&limit=5` — прокси к DaData

### Backend changes
- `backend/app/api/routes/suggest.py` — endpoint подсказок адреса
- `backend/app/services/address_suggest_service.py` — нормализация ответа DaData
- `DADATA_API_KEY` в `backend/.env.example` (опционально; без ключа — пустой список + ручной ввод)

### Validation
- `location`: required + mode (`country_only` / `city_only` / `country_and_city`)
- `rating`: required + диапазон min–max + шаг step; NPS сохраняет категорию detractor/passive/promoter
- `address`: required + `allowManualInput: false` требует выбор из подсказок

### Integration points
- Палитра: `ToolPanel.tsx`
- Настройки поля: `FieldTypeSettings.tsx` в `FieldBlock`
- Preview/renderer: `FieldPreview.tsx`, `FieldRenderer.tsx`
- Заполнение: `FormPreviewModal.tsx` (legacy), Formily (`FormilyLocationInput`, `FormilyRatingInput`, `FormilyAddressInput`)
- Сохранение схемы: `forms.api.ts` (`config` в payload)
- Отображение в заявке: `formatFieldValue.ts` (structured + legacy string fallback)

### Verification
- lint: 0 errors, 0 warnings
- build: успешно (`tsc -b && vite build`)
- typecheck: через `npm run build`
- tests: не запускались (скрипт отсутствует)
- backend import: `from app.main import app` — ok (Docker)

### Remaining risks
- DaData требует `DADATA_API_KEY` на backend; без ключа подсказки недоступны (fallback: ручной ввод)
- `provider: yandex` использует клиентский Yandex Suggest (как раньше); `custom` — заглушка
- Справочник городов локальный (MVP); для production нужен backend dictionary API
