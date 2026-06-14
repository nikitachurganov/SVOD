# API Layer Rules — СВОД

## Принцип

Вся HTTP-коммуникация frontend → backend централизована в `src/shared/api/`.
Единственный authenticated клиент: `src/shared/lib/api.ts`.

## Клиент (`src/shared/lib/api.ts`)

```typescript
// BASE_URL из import.meta.env.VITE_API_URL (обязателен)
// Request interceptor: Bearer token из localStorage.access_token
// Response interceptor: 401 → clear token → redirect /auth
```

**Не создавать** второй authenticated axios instance.

Исключение: `public.api.ts` — отдельный `publicApi` без Bearer (публичные формы).

## Модули (фактическая структура)

| Файл | Сущность | Основные методы |
|------|----------|-----------------|
| `auth.api.ts` | Auth | `signInWithEmail`, `signUpWithEmail`, `signOut` |
| `profiles.api.ts` | Profile | `getProfileById('me')` |
| `forms.api.ts` | Forms | `getForms`, `getFormById`, `createForm`, `updateForm`, `deleteForm`, payload mappers |
| `requests.api.ts` | Requests | CRUD, counts, AI analysis, performers, stages, TZ, `getRequestWithForm` |
| `organizations.api.ts` | Organizations | CRUD org, members, invitations, public link |
| `files.api.ts` | Files | `uploadFile`, `uploadFieldFiles`, `deleteRequestFiles` |
| `public.api.ts` | Public forms | `getPublicPageData`, `suggestPublicForms`, `submitPublicRequest` |

## Правила модулей

1. **Один модуль — одна доменная область.**
2. **Явные DTO-типы** — `interface`/`type` для payload и response.
3. **Именование:** `getX`, `createX`, `updateX`, `deleteX` + суффикс `.api.ts`.
4. **Импорт клиента:** `import api from '../lib/api'`.
5. **Snake_case на wire** — body/query в формате backend (`organization_id`, `first_name`).
6. **CamelCase в TS** — для удобства в UI где уже принято (`closedAt` в types).
7. **Ошибки** — пробрасывать через `Promise.reject`; UI обрабатывает в page/component.

## Где НЕ писать API-вызовы

- `src/pages/*.tsx` — только импорт из `shared/api`
- `src/components/**` — только импорт из `shared/api`
- `src/services/` — **не создавать** новые service-файлы; логика в `shared/api`

## Добавление нового endpoint

1. Backend route + schema (отдельная задача или согласовано).
2. Метод в соответствующем `*.api.ts`.
3. Типы request/response.
4. Вызов из page/hook — не из случайного компонента.
5. `npm run lint && npm run build`.

## Запрещено

- `fetch` / второй axios для authenticated запросов
- `any` в DTO
- Изменение URL endpoints без backend-задачи
- Stub-методы, бросающие `not implemented`, в production API
- Циклические импорты между API-модулями

## Env

Frontend: `VITE_API_URL` (см. `.env.example`).

```bash
VITE_API_URL=http://localhost:8000
```

## Пример добавления метода

```typescript
// src/shared/api/organizations.api.ts
export const getOrganization = async (id: string): Promise<OrganizationResponse> => {
  const { data } = await api.get<OrganizationResponse>(`/organizations/${id}`);
  return data;
};
```
