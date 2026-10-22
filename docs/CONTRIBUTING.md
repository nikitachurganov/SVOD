# Участие в разработке — СВОД

Правила кода и архитектуры — в [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md), [FRONTEND_RULES.md](./FRONTEND_RULES.md), [BACKEND_RULES.md](./BACKEND_RULES.md), [API_RULES.md](./API_RULES.md). Здесь — как поднять окружение, запустить проверки и оформить изменения. Переменные окружения описаны в [ENV.md](./ENV.md).

## Окружение

| Что | Версия | Заметка |
|-----|--------|---------|
| Node.js | 22 (как в `Dockerfile`) | `npm ci` / `npm install` |
| Python | 3.12 (допустимо 3.11–3.13) | Не используйте 3.14: для `asyncpg` и `pydantic-core` нет колёс, нужна сборка из исходников (см. [backend/README.md](../backend/README.md)) |
| Docker + Compose v2 | любая актуальная | Запуск backend, БД, MinIO и воркера |

### Первый запуск

```bash
# 1. Backend (PostgreSQL, MinIO, миграции, API, worker) — из каталога backend/
cd backend
cp .env.example .env          # задайте OPENROUTER_API_KEY, остальное можно оставить
docker compose up -d --build  # API: http://localhost:8000 , MinIO: http://localhost:9001

# 2. Frontend — из корня репозитория
cd ..
cp .env.example .env          # VITE_API_URL=http://localhost:8000
npm install
npm run dev                   # http://localhost:5173
```

- Telegram-бот локально запускается профилем: `docker compose --profile telegram up -d` (в `backend/`).
- Миграции применяет сервис `migrate` при `docker compose up`; вручную: `docker compose exec api alembic upgrade head`.
- Запуск backend без Docker: `backend/install-deps.ps1` создаёт `.venv`, затем `alembic upgrade head` и `uvicorn app.main:app --reload` (в `DATABASE_URL` — `localhost`, не `db`).

<!-- AUTO-GENERATED: scripts (источник: package.json; обновлять командой /ecc:update-docs) -->

## Команды frontend

| Команда | Что делает |
|---------|------------|
| `npm run dev` | Dev-сервер Vite с hot reload (порт 5173, при занятом порте Vite берёт следующий) |
| `npm run build` | `tsc -b && vite build`: проверка типов и production-сборка в `dist/` |
| `npm run lint` | ESLint по всему проекту |
| `npm run preview` | Локальный просмотр production-сборки |

Скрипта `npm test` нет: у frontend нет автотестов, типы проверяются в `build`.

<!-- /AUTO-GENERATED: scripts -->

## Тесты backend

Тесты написаны на `unittest` (в `backend/requirements.txt` нет `pytest`), БД для них не нужна. Запуск из каталога `backend/`:

```bash
# в активированном .venv
python -m unittest discover -s tests -t .

# или без локального Python — в образе API с монтированием кода
docker run --rm -v "$PWD:/app" -w /app --entrypoint python backend-api -m unittest discover -s tests -t .
```

Один модуль: `python -m unittest tests.test_survey_results`. Образ `backend-api` появляется после `docker compose build api`.

Как писать тесты:

- кладите файл в `backend/tests/test_<тема>.py` (там же `__init__.py`);
- чистую логику (подсчёты, парсеры) тестируйте без БД на `SimpleNamespace`-заглушках, как в `tests/test_survey_results.py`;
- вызовы LLM подменяйте через `unittest.mock.AsyncMock` / `patch.object` (см. `tests/test_survey_ai_analysis.py`) — сетевых обращений в тестах быть не должно.

## Стиль кода

- **Frontend:** ESLint (`eslint.config.js`: `typescript-eslint`, `react-hooks`, `react-refresh`). Без `any`, без массовых `eslint-disable`, без `console.log`. Тексты интерфейса — на русском, UI-библиотека одна — Ant Design.
- **Backend:** слои `routes → services → repositories → models`, схемы Pydantic в `schemas/`; миграции Alembic — отдельным файлом `backend/migrations/versions/NNN_<имя>.py`.
- Форматтеров и pre-commit-хуков в репозитории нет — следите за стилем вручную.
- Не коммитьте `.env`, `backend/.env`, `__pycache__/` и `*.pyc`.

## Чек-лист перед PR

- [ ] `npm run lint` — 0 ошибок и предупреждений
- [ ] `npm run build` — проходит
- [ ] Если менялся backend: `python -m unittest discover -s tests -t .` — проходит
- [ ] Если менялась модель БД: добавлена миграция, проверены `alembic upgrade head` и `alembic downgrade -1`
- [ ] Новые переменные окружения добавлены в `backend/.env.example` и [ENV.md](./ENV.md)
- [ ] Изменения API отражены в `src/shared/api/*` и типах frontend
- [ ] В описании PR: что изменено и зачем, список файлов, результаты проверок, оставшиеся риски
