# Runbook — СВОД (production)

Операционная памятка для `app.svodservice.ru`. Первичная установка, DNS и SSL подробно описаны в [DEPLOYMENT_VPS.md](./DEPLOYMENT_VPS.md) — здесь только повседневные действия. Переменные окружения — в [ENV.md](./ENV.md).

Все команды выполняются на VPS в `/opt/svod`. Для краткости:

```bash
alias dc='docker compose -f docker-compose.production.yml'
```

## Сервисы

| Сервис | Что делает | Порты | Healthcheck |
|--------|------------|-------|-------------|
| `nginx` | Единственная точка входа: `/api/*` → `api`, остальное → `frontend` | 80, 443 | зависит от `frontend` и `api` |
| `frontend` | Статика SPA | внутренний | `wget http://127.0.0.1/` |
| `api` | FastAPI | внутренний 8000 | `curl http://localhost:8000/health` |
| `migrate` | `alembic upgrade head`, затем завершается | — | — |
| `worker` | Фоновый ИИ-анализ заявок, просрочки этапов; метрики на :9101 | внутренний | нет |
| `telegram-bot` | Long polling Telegram, ровно один экземпляр | нет | нет |
| `db` | PostgreSQL 16, volume `pgdata` | внутренний | `pg_isready` |

## Деплой

```bash
cd /opt/svod
git pull
dc up -d --build          # весь стек; миграции применит сервис migrate
dc ps                     # все сервисы Up, api и frontend — healthy
curl -s https://app.svodservice.ru/api/health   # {"status":"ok"}
```

Только backend: `dc up -d --build api worker telegram-bot`. Только frontend: `dc up -d --build frontend nginx`.

После деплоя пройдите чек-лист из [DEPLOYMENT_VPS.md](./DEPLOYMENT_VPS.md#12-чеклист-готовности): логин, создание заявки.

## Мониторинг

| Что | Где |
|-----|-----|
| Здоровье API | `GET /api/health` → `{"status":"ok"}` |
| Метрики API | `GET /metrics` (Prometheus) |
| Метрики worker | порт 9101 внутри сети Compose |
| Логи | `dc logs -f --tail=200 api` (аналогично `worker`, `telegram-bot`, `nginx`) |

Метрики приложения: `svod_request_api_errors_total{method,status}`, `svod_ai_job_duration_seconds{kind,outcome}`, `svod_ai_job_retries_total{kind}`, `svod_s3_errors_total{operation}`, `svod_overdue_stages`, `svod_notification_skipped_total{type}`.

> **Риск.** Nginx проксирует весь `/api/*` в backend, поэтому `/metrics` backend доступен снаружи как `https://app.svodservice.ru/api/metrics`. Закройте этот путь в `deploy/nginx/*.conf`, если метрики не должны быть публичными.

Сбор метрик, дашборды и алерты в репозитории **не настроены** (нет конфигурации Prometheus/Alertmanager/Grafana). Эскалации и дежурства описывать пока нечем: о сбоях узнают по `dc ps`, healthcheck и обращениям пользователей.

## Частые проблемы

| Симптом | Причина и действие |
|---------|--------------------|
| `400` на `OPTIONS` в браузере | Origin не в `CORS_ORIGINS` (`backend/.env`). Добавьте домен JSON-списком и перезапустите `api` |
| `getaddrinfo failed` при запуске `alembic` на хосте | В `DATABASE_URL` указан хост `db` — он существует только внутри Docker-сети. На хосте используйте `localhost` |
| `api` не стартует, ошибка валидации настроек | Не задан `OPENROUTER_API_KEY` или `OPENROUTER_MODEL` (обязательны и не пустые) |
| Compose: `Set POSTGRES_PASSWORD in .env` | Не заполнен корневой `.env` |
| ИИ отвечает «ИИ-сервис недоступен» / «пустой ответ» (HTTP 502) | Проверьте `OPENROUTER_API_KEY`, баланс и доступность модели; ищите `OpenRouter HTTP error` в `dc logs api` |
| `429` на запросах ИИ по опросам | Лимит запросов на пользователя (40 за 180 с, в памяти процесса); подождите, перезапуск `api` сбрасывает счётчик |
| ИИ-анализ заявок не выполняется | `AI_JOBS_ENABLED=true`? `dc logs worker`; зависшие задачи подхватываются через `AI_JOB_STALE_SECONDS` |
| Файлы не загружаются / не открываются | `S3_PUBLIC_ENDPOINT_URL` должен быть доступен браузеру (signed URL); смотрите `svod_s3_errors_total` |
| Письма-приглашения не уходят | Пустой `SMTP_HOST` — письма отключены, ссылку активации копируют из интерфейса. Иначе проверьте `SMTP_*` и `dc logs api` |
| Бот молчит, в логе «простаивает» | Заданы не оба значения `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME`. В группах бот видит сообщения только при отключённом privacy mode (`/setprivacy` → Disable в @BotFather) |
| После переключения на HTTPS nginx не стартует | Нет сертификатов в volume `certbot_certs` — см. раздел 8 в [DEPLOYMENT_VPS.md](./DEPLOYMENT_VPS.md) |
| Установка backend на Windows падает на `link.exe` | Python 3.14: нет колёс для `asyncpg`/`pydantic-core`. Используйте 3.12 (`backend/install-deps.ps1`) |

## Откат

Откат только кода (схема БД не менялась):

```bash
cd /opt/svod
git log --oneline -5                 # выбрать предыдущий рабочий коммит
git checkout <commit>                # или git revert <плохой коммит>
dc up -d --build
```

Откат вместе с миграцией БД. Сервис `migrate` умеет только вверх, а файл миграции есть лишь в новой версии кода, поэтому миграцию откатывают **до** переключения на старый код:

```bash
dc exec db pg_dump -U postgres myapp > /opt/svod-backup-$(date +%F).sql   # дамп перед откатом
dc stop api worker telegram-bot
dc run --rm api alembic current                  # какая ревизия применена
dc run --rm api alembic downgrade -1             # на одну миграцию назад (в образе новой версии)
git checkout <commit>
dc up -d --build
```

Миграции с удалением колонок или таблиц необратимы по данным — без дампа не откатывайте.

Автоматических бэкапов БД в репозитории **нет** — настройте их на VPS отдельно (cron + `pg_dump` или бэкап volume `pgdata`).

## Дополнительно

- Ручной запуск миграций: `dc exec api alembic upgrade head`
- Текущая ревизия БД: `dc exec api alembic current`
- Перезапуск одного сервиса: `dc restart api`
- Локальная проверка перед деплоем: `npm run lint`, `npm run build`, `dc config`, `dc build` (см. [CONTRIBUTING.md](./CONTRIBUTING.md))
