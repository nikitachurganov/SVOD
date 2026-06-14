# Frontend Rules — СВОД

## Stack

- **React 19** + **TypeScript 5.9** + **Vite 7**
- **Ant Design 6** + `@ant-design/icons`
- **React Router 7** — `createBrowserRouter`, `RouterProvider`
- **axios** — только через `shared/api` и `shared/lib/api.ts`
- Стили: `brand-tokens.css`, `index.css`, CSS-классы с префиксом `app-`

## Структура

| Папка | Назначение |
|-------|------------|
| `src/pages/` | Экраны, привязанные к routes. Минимум бизнес-логики — координация. |
| `src/components/layout/` | App shell: sidebar, header, breadcrumbs, nav |
| `src/components/organization/` | Модалки, панели организации |
| `src/components/request/` | UI заявок, AI-панели, execution |
| `src/shared/api/` | HTTP-запросы (см. API_RULES) |
| `src/shared/context/` | Auth, organization, theme, notifications |
| `src/shared/hooks/` | `useAuth`, `useOrganization`, form store |
| `src/shared/ui/` | Переиспользуемые UI, form-builder |
| `src/types/` | Domain types (request, form, organization, …) |

## Импорты

- Относительные пути (`../shared/...`). Path alias `@/` **не настроен**.
- Context: типы в `*.context.ts`, provider в `*.provider.tsx`, hook в `shared/hooks/*.hooks.ts`.
- Form store: `useFormStore.ts`, `FormProvider.tsx`, `useFormCtx.ts`, `formStore.types.ts`.

## Запрещено

- Carbon, Supabase, zustand, новые UI-библиотеки
- `any`, `console.log`, `debugger`
- API-запросы внутри `pages/` и `components/` (кроме крайне локальных случаев — предпочитать `shared/api`)
- Дублирование axios-клиента
- Mock/stub UI без пометки и без согласования
- Временные `eslint-disable` без комментария с причиной

## Компоненты

- Типизированные props (`interface` / `type`).
- Один компонент — одна ответственность.
- Не смешивать в одном файле: layout + API + бизнес-правила.
- Для `react-refresh`: component files экспортируют только компоненты; hooks/utils/types — в отдельные файлы.

## React hooks

- `exhaustive-deps`: не добавлять зависимости механически; стабилизировать через `useMemo`, `useCallback`, primitive selectors.
- `set-state-in-effect`: derived state → `useMemo`; initial state → lazy `useState`; sync с внешней системой — только в effect callbacks.
- Store methods (`resetFields`, `registerField`) — деструктурировать из store, они стабильны (`useCallback` внутри hook).

## Routing

Не менять без задачи:

- `/auth`, `/requests`, `/forms`, `/participants`, `/settings/organization`
- Public routes: `/form/:token`, `/form/:token/fill/:formId`
- `ProtectedLayout`, org empty state в `App.tsx`

## Auth / Organization

- `useAuth()` — user, profile, signIn, signUp, signOut
- `useOrganization()` — organizations, activeOrganization, setActiveOrganizationId
- Токен: `localStorage.access_token`
- Активная org: `localStorage.active_organization_id`

## Стили

- Использовать `--app-*` и `--brand-*` из `brand-tokens.css`.
- Новые цвета — только через токены или Ant Design theme (`ThemeProvider`).
- Layout sidebar: `--app-sidebar-width: 258px`, collapsed: `56px`.
- Inline styles допустимы там, где уже приняты в проекте (form-builder, некоторые pages), но для shell/layout предпочитать CSS-классы.
- Assets: `src/assets/logo.svg`, `src/assets/FAV icon.svg`.

## Form builder

- `@dnd-kit` для drag-and-drop.
- `FormProvider` + `useFormStore` для preview/fill.
- Не трогать form-builder без явной задачи.

## Проверки

```bash
npm run lint
npm run build
```

Ожидание: **0 errors, 0 warnings**, build success.
