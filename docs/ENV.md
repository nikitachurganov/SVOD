# Переменные окружения — СВОД

Справочник собран из `backend/app/core/config.py` (имена и значения по умолчанию), `backend/.env.example`, `.env.example` и `Dockerfile`. Пошаговая настройка production — в [DEPLOYMENT_VPS.md](./DEPLOYMENT_VPS.md).

Где задаются переменные:

| Файл | Кто читает | Шаблон |
|------|------------|--------|
| `.env` (корень) | Vite в dev (`VITE_*`); в production — Docker Compose (`POSTGRES_*`, `VITE_*`) | `.env.example` (dev), `frontend.env.production.example` (production) |
| `backend/.env` | Backend, worker, telegram-bot (`pydantic-settings`, неизвестные ключи игнорируются) | `backend/.env.example` (dev), `backend/.env.production.example` (production) |

`.env` и `backend/.env` не коммитятся.

<!-- AUTO-GENERATED: env (источник: backend/app/core/config.py, .env.example; обновлять командой /ecc:update-docs) -->

## Frontend (build-time)

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `VITE_API_URL` | да | `http://localhost:8000` (dev), `/api` (production) | Базовый URL API. В production задаётся build-аргументом в `docker-compose.production.yml` |
| `VITE_FORMILY_RUNTIME` | нет | `true` | Включает Formily-рантайм форм |
| `VITE_ENABLE_REQUEST_ASSISTANT` | нет | включено | Выключается только значением ровно `false` (ИИ-ассистент заявок) |
| `VITE_ENABLE_EXECUTOR_MATCHING` | нет | включено | Выключается только значением ровно `false` (подбор исполнителей) |
| `VITE_YANDEX_MAPS_API_KEY` | нет | пусто | Ключ для скрипта Яндекс Карт в браузере (если пусто — карты грузятся без ключа). Не путать с `YANDEX_MAPS_API_KEY` в `backend/.env` для геосаджеста; в `.env.example` этой переменной нет |

## Compose (корневой `.env`, только production)

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `POSTGRES_PASSWORD` | да | — | Пароль PostgreSQL (без него Compose не стартует) |
| `POSTGRES_USER` | нет | `postgres` | Пользователь PostgreSQL |
| `POSTGRES_DB` | нет | `myapp` | Имя базы |

## Backend: ядро

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `DATABASE_URL` | да | `postgresql+asyncpg://postgres:postgres@localhost:5432/myapp` | Строка подключения. `localhost` — запуск на хосте; `db` — только внутри сети Docker Compose |
| `SECRET_KEY` | да | `change-me` | Ключ подписи JWT. В production — случайная строка 48+ символов |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | нет | `1440` | Срок жизни access-токена |
| `CORS_ORIGINS` | да (production) | локальные адреса Vite и `https://servicedev.space` | JSON-список разрешённых origin. Для `localhost`/`127.0.0.1` на любом порту есть отдельное разрешение в `main.py` |
| `APP_PUBLIC_URL` | да (production) | `http://localhost:5173` | Публичный адрес приложения: в него ведут ссылки в письмах |

## Backend: хранилище файлов (S3)

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `FILE_STORAGE_BACKEND` | нет | `s3` | Тип хранилища |
| `S3_ENDPOINT_URL` | да | `http://localhost:9000` | Endpoint, доступный контейнерам |
| `S3_PUBLIC_ENDPOINT_URL` | да | `http://localhost:9000` | Endpoint, доступный браузеру (для временных signed URL) |
| `S3_REGION` | нет | `us-east-1` | Регион |
| `S3_BUCKET` | да | `svod-private` | Приватный bucket |
| `S3_ACCESS_KEY_ID` | да | `minio` | Ключ доступа |
| `S3_SECRET_ACCESS_KEY` | да | `minio-secret` | Секрет доступа |
| `S3_PRESIGNED_URL_SECONDS` | нет | `900` | Время жизни signed URL, с |
| `MAX_UPLOAD_SIZE_BYTES` | нет | `20971520` (20 МиБ) | Максимальный размер загружаемого файла |

## Backend: ИИ (OpenRouter) и фоновые задачи

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `OPENROUTER_API_KEY` | да | — | Ключ OpenRouter. Без него backend не стартует; хранить только на сервере |
| `OPENROUTER_MODEL` | да | `z-ai/glm-5.3-flash` | Идентификатор модели из каталога OpenRouter (не пустой) |
| `OPENROUTER_REASONING_EFFORT` | нет | `low` | `minimal` / `low` / `medium` / `high`; пусто — по умолчанию провайдера |
| `AI_JOBS_ENABLED` | нет | `true` | Включает фоновый ИИ-анализ заявок в worker |
| `AI_WORKER_POLL_SECONDS` | нет | `2.0` | Период опроса очереди ИИ-задач |
| `AI_JOB_MAX_ATTEMPTS` | нет | `3` | Число попыток выполнения задачи |
| `AI_JOB_STALE_SECONDS` | нет | `900` | Через сколько секунд зависшая задача считается брошенной |
| `WORKER_METRICS_PORT` | нет | `9101` | Порт Prometheus-метрик worker |

ИИ-резюме и чат по результатам опросов вызывают OpenRouter прямо из запроса API (не через очередь) и используют те же `OPENROUTER_*`.

## Backend: почта, подсказки адресов

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `SMTP_HOST` | нет | пусто | Пусто — письма не отправляются, владелец копирует ссылку приглашения из интерфейса |
| `SMTP_PORT` | нет | `465` | Порт SMTP |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | нет | пусто | Учётные данные (для Яндекс 360 — пароль приложения) |
| `SMTP_FROM` | нет | пусто | Адрес отправителя |
| `SMTP_SECURITY` | нет | `ssl` | `ssl` (465) / `starttls` (587) / `none` |
| `SMTP_TIMEOUT_SECONDS` | нет | `15.0` | Таймаут соединения |
| `INVITATION_TTL_DAYS` | нет | `7` | Срок действия приглашения |
| `DADATA_API_KEY` | нет | пусто | Подсказки адресов (`GET /suggest/address`) |
| `YANDEX_MAPS_API_KEY` | нет | пусто | Геосаджест (`GET /suggest/yandex`) |

## Backend: Telegram-бот

Интеграция включена, только если заданы **оба** значения: `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME`.

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `TELEGRAM_BOT_TOKEN` | нет | пусто | Токен от @BotFather |
| `TELEGRAM_BOT_USERNAME` | нет | пусто | Имя бота без `@`, для ссылок `t.me/...` |
| `TELEGRAM_LINK_TOKEN_TTL_MINUTES` | нет | `10` | Срок действия токена привязки аккаунта |
| `TELEGRAM_POLL_SECONDS` | нет | `3.0` | Период опроса очереди уведомлений |
| `TELEGRAM_NOTIFICATION_MAX_AGE_HOURS` | нет | `24` | Более старые недоставленные уведомления пропускаются |
| `TELEGRAM_ANALYSIS_MIN_MESSAGES` | нет | `3` | Анализ группы после N новых сообщений… |
| `TELEGRAM_ANALYSIS_IDLE_SECONDS` | нет | `180` | …и M секунд тишины |
| `TELEGRAM_MESSAGE_RETENTION_DAYS` | нет | `7` | Сколько дней хранятся сообщения групп |
| `TELEGRAM_SUGGESTION_TTL_HOURS` | нет | `24` | Через сколько часов неподтверждённый черновик заявки устаревает |

<!-- /AUTO-GENERATED: env -->
