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
| `VITE_LEGAL_FULL_NAME`, `VITE_LEGAL_INN` | для платежей | пусто | ФИО и ИНН самозанятого: показываются на публичных страницах `/offer`, `/contacts` и в подвале. Читаются при сборке: после смены пересоберите `frontend`. Пока пусто, на странице видна пометка «не заполнено» |
| `VITE_LEGAL_PHONE`, `VITE_LEGAL_ADDRESS` | для платежей | пусто | Телефон и почтовый адрес для страницы «Контакты и реквизиты» |
| `VITE_LEGAL_EMAIL` | нет | `support@svodservice.ru` | Почта для связи на публичных страницах |
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
| `AVATAR_MAX_BYTES` | нет | `2097152` (2 МиБ) | Максимальный размер фото профиля (JPEG, PNG, WebP). Фото хранится в том же S3-бакете, что и файлы заявок |

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

## Backend: тарифы и биллинг

| Переменная | Обязательна | По умолчанию | Описание |
|------------|-------------|--------------|----------|
| `BILLING_ENABLED` | нет | `false` | Включает тарифы и учёт использования. Выключено — никто не ограничен, как до появления биллинга; `GET /billing/subscription` отдаёт план «Без ограничений», подписки и счётчики не создаются. Журнал расхода ИИ (`ai_usage_log`) и переключатель `users.ai_enabled` работают всегда |
| `BILLING_ENFORCE` | нет | `false` | Работает вместе с `BILLING_ENABLED=true`. `false` — «теневой режим»: использование считается, ничего не блокируется. `true` — лимиты блокируют действия. Сейчас блокирует только квота ИИ (`402 limit_reached`); остальные лимиты — этап 3 плана |
| `BILLING_PAST_DUE_GRACE_DAYS` | нет | `3` | Сколько дней платный тариф продолжает работать после неудачного продления |
| `BILLING_TRIAL_DAYS` | нет | `14` | Длина бесплатного пробного периода тарифа «Исследователь» (один раз на человека) |
| `BILLING_TICK_SECONDS` | нет | `300` | Как часто worker переводит закончившиеся подписки на «Старт», шлёт напоминания и выполняет отложенные удаления аккаунтов. Работает только при `BILLING_ENABLED=true`; письма уходят при заданном `SMTP_HOST` |
| `ADMIN_NOTIFY_EMAIL` | нет | пусто | Адрес, на который приходит письмо о новой заявке на тариф (нужен `SMTP_HOST`). Пусто — заявки видны только на странице администрирования, вкладка «Заявки на тариф» |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | нет | пусто | Магазин ЮKassa (личный кабинет → «Интеграция»). Онлайн-оплата включается, только когда заданы оба и `BILLING_ENABLED=true`; иначе предлагается лишь заявка на счёт. Секретный ключ храните только на сервере. Настройка — [RUNBOOK.md](./RUNBOOK.md), «Приём платежей» |
| `YOOKASSA_API_URL` | нет | `https://api.yookassa.ru/v3` | Адрес API ЮKassa; менять нужно только для проверки на макете |
| `YOOKASSA_RETURN_URL` | нет | пусто | Куда возвращается человек после оплаты. Пусто — вкладка «Подписка» сервиса опросов (`SURVEYS_APP_PUBLIC_URL` или `APP_PUBLIC_URL`); к адресу добавляется `payment=<id платежа>` |
| `YOOKASSA_VERIFY_WEBHOOK_IP` | нет | `true` | Принимать уведомления только с адресов ЮKassa. Проверка по API всё равно выполняется для каждого уведомления, так что отключать её можно, если прокси не передаёт настоящий адрес (`X-Real-IP`) |
| `PAYMENT_PENDING_GIVE_UP_HOURS` | нет | `72` | Сколько часов worker опрашивает ЮKassa о неоплаченном платеже; дальше платёж ждёт только уведомления |
| `OPENROUTER_MANAGEMENT_KEY` | нет | пусто | Ключ управления OpenRouter (в кабинете, отдельный от обычного ключа). С ним worker читает остаток кредитов (`GET /api/v1/credits`) и предупреждает письмом, когда он ниже порога. Пусто — баланс не отслеживается, ИИ встанет без предупреждения, когда кредиты кончатся |
| `OPENROUTER_LOW_BALANCE_USD` | нет | `5` | Порог остатка кредитов OpenRouter, ниже которого приходит предупреждение |
| `OPS_ALERT_COOLDOWN_MINUTES` | нет | `360` | Не чаще чем раз в столько минут worker повторяет одно и то же оповещение о сбое (ИИ не отвечает, потолок расходов, кредиты, платежи). Оповещения идут на `ADMIN_NOTIFY_EMAIL` и в лог как `ERROR … Ops alert`. Список — [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) |
| `AI_DAILY_BUDGET_USD` | нет | `0` | Потолок расходов на ИИ всего сервиса за скользящие 24 часа, в долларах. При достижении ИИ опросов отвечает `503 ai_budget_exceeded`. `0` — без потолка. Работает независимо от `BILLING_ENABLED` |
| `AI_COST_RUB_PER_USD` | нет | `90` | Курс для бюджетов ИИ на аккаунт в рублях: доллар с доплатой около 10 % за пополнение OpenRouter из РФ |
| `OPENROUTER_PRICE_IN_USD_PER_M`, `OPENROUTER_PRICE_OUT_USD_PER_M` | нет | `0.17`, `0.60` | Цена за миллион входных и выходных токенов. Нужна, только если OpenRouter не вернул стоимость запроса; сверьте с ценой вашей модели |

План внедрения — [BILLING_BACKEND_PLAN.md](./BILLING_BACKEND_PLAN.md). Первого администратора назначает команда на сервере, см. [RUNBOOK.md](./RUNBOOK.md), раздел «Администратор платформы».

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
| `SURVEYS_APP_PUBLIC_URL` | нет | пусто | Публичный адрес отдельного сервиса «Опросы»: в него ведут ссылки восстановления пароля для его пользователей. Пусто — используется `APP_PUBLIC_URL` |
| `PASSWORD_RESET_TTL_MINUTES` | нет | `60` | Срок действия ссылки восстановления пароля |
| `PASSWORD_RESET_COOLDOWN_SECONDS` | нет | `60` | Как часто можно запрашивать письмо для одного аккаунта. Без SMTP ссылка пишется в лог API |
| `EMAIL_VERIFICATION_TTL_HOURS` | нет | `48` | Срок действия ссылки подтверждения почты после регистрации |
| `EMAIL_VERIFICATION_COOLDOWN_SECONDS` | нет | `60` | Как часто можно просить повторное письмо подтверждения. Без SMTP баннер «подтвердите почту» не показывается, а ссылка пишется в лог API |
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
