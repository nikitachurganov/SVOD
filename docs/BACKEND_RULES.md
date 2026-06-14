# Backend Rules — СВОД

## Stack

| Компонент | Путь / версия |
|-----------|---------------|
| Framework | FastAPI (`backend/app/main.py`) |
| ORM | SQLAlchemy async + asyncpg |
| Migrations | Alembic (`backend/migrations/`) |
| Auth | JWT (`app/core/security.py`), bcrypt |
| Config | `app/core/config.py`, pydantic-settings |

## Структура слоёв

```
backend/app/
  api/routes/     # HTTP endpoints, deps injection
  services/       # бизнес-логика
  repositories/   # доступ к БД
  models/         # SQLAlchemy models
  schemas/        # Pydantic request/response
  core/           # config, database, security
```

**Правило:** routes тонкие → логика в services → данные в repositories.

## API prefixes

| Prefix | Router |
|--------|--------|
| `/auth` | login, register, token, me |
| `/forms` | CRUD форм |
| `/requests` | CRUD заявок, AI, stages, TZ |
| `/files` | upload/delete |
| `/organizations` | orgs, members, invitations, public links |
| `/public/request` | публичные формы без auth |

## Auth (не менять без задачи)

- `POST /auth/register` — регистрация + token
- `POST /auth/login` — email/password → token
- `POST /auth/token` — OAuth2 form compat
- `GET /auth/me` — профиль текущего пользователя (Bearer)

**Нет:** forgot-password, reset-password, Supabase auth.

## Изменения БД

- Только через Alembic migration в `backend/migrations/versions/`.
- Не менять models без migration.
- Не удалять колонки/таблицы, если frontend ещё использует поля.

## Env

- Шаблон: `backend/.env.example`
- Обязательные: `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`
- При добавлении env — обновить `.env.example`
- Секреты не коммитить

## Согласование с frontend

При изменении endpoint:

1. Обновить Pydantic schema.
2. Обновить соответствующий `src/shared/api/*.api.ts`.
3. Обновить TS types в `src/types/` или рядом с API-модулем.
4. Проверить `npm run build` на frontend.

## Запрещено

- Supabase, Carbon (не применимо к backend, но не добавлять аналоги без задачи)
- Бизнес-логика в routes напрямую (без service)
- Секреты в коде
- Удаление endpoints без проверки frontend consumers
- Breaking changes response без обновления DTO

## Запуск локально

```bash
cd backend
# активировать .venv
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Проверки при изменениях

- Импорт приложения: `python -c "from app.main import app"`
- Ручная проверка затронутых endpoints
- Отдельного test script в проекте нет
