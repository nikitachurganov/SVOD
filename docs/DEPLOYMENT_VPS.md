# Деплой СВОД на VPS (app.svodservice.ru)

Пошаговая инструкция для production-развёртывания на Ubuntu VPS с Docker Compose.

| URL | Назначение |
|-----|------------|
| `https://app.svodservice.ru` | Frontend (SPA) |
| `https://app.svodservice.ru/api` | Backend API (FastAPI) |
| `https://app.svodservice.ru/api/health` | Healthcheck |

Локальная разработка **не меняется**: `npm run dev` + `backend/docker-compose.yml`.

---

## 1. Требования

- VPS с **Ubuntu 22.04+** (или аналог)
- **Docker** и **Docker Compose** v2
- Домен **svodservice.ru** (управление DNS)
- DNS **A-запись** для `app` → IP VPS
- Открытые порты **80** и **443**
- Git-доступ к репозиторию

Стек проекта:

| Компонент | Технология |
|-----------|------------|
| Frontend | React 19 + Vite 7 → статика в Nginx |
| Backend | FastAPI + Uvicorn |
| БД | PostgreSQL 16 |
| Redis / Celery | **не используются** |

---

## 2. DNS

В панели регистратора домена добавьте запись:

```txt
Тип: A
Имя: app
Значение: <IP вашего VPS>
TTL: 300–3600
```

Проверка (с вашего компьютера):

```bash
dig +short app.svodservice.ru
# или
nslookup app.svodservice.ru
```

Должен вернуться IP VPS.

---

## 3. Подготовка сервера

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl
```

### Установка Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Перелогиньтесь (или `newgrp docker`), чтобы группа `docker` применилась.

Проверка:

```bash
docker --version
docker compose version
```

### Опционально: Certbot на хосте

Если планируете выпускать сертификат через webroot в Docker (рекомендуется), отдельный Nginx на хосте **не нужен**.

Для варианта с `certbot --nginx` на хосте:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

> При Docker-деплое edge-Nginx уже в контейнере. Используйте **webroot** (раздел 8) или остановите контейнер `nginx` на время `certbot --nginx`.

---

## 4. Клонирование проекта

```bash
sudo mkdir -p /opt/svod
sudo chown $USER:$USER /opt/svod
cd /opt
git clone REPOSITORY_URL svod
cd /opt/svod
```

Замените `REPOSITORY_URL` на URL вашего репозитория.

---

## 5. Настройка env

### Корневой `.env` (Compose + PostgreSQL)

```bash
cp .env.production.example .env
nano .env
```

Обязательно задайте:

| Переменная | Описание |
|------------|----------|
| `POSTGRES_PASSWORD` | Сильный пароль БД |
| `POSTGRES_USER` | По умолчанию `postgres` |
| `POSTGRES_DB` | По умолчанию `myapp` |
| `VITE_FORMILY_RUNTIME` | `true` (как в dev) |

### Backend `backend/.env`

```bash
cp backend/.env.production.example backend/.env
nano backend/.env
```

Обязательно задайте:

| Переменная | Описание |
|------------|----------|
| `SECRET_KEY` | Случайная строка (48+ символов) |
| `GIGACHAT_AUTH_KEY` | Ключ GigaChat |
| `GIGACHAT_SCOPE` | Например `GIGACHAT_API_PERS` |
| `GIGACHAT_MODEL` | Например `GigaChat` |
| `CORS_ORIGINS` | `["https://app.svodservice.ru"]` |
| `FILE_STORAGE_BASE_URL` | `https://app.svodservice.ru/api/uploads` |
| `YANDEX_MAPS_API_KEY` | Для подсказок адреса (опционально) |
| `DADATA_API_KEY` | Для DaData (опционально) |

`DATABASE_URL` в Compose **переопределяется** из `POSTGRES_*` в корневом `.env`. Значение в `backend/.env` должно совпадать по паролю или может быть удалено.

Генерация `SECRET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Frontend API URL

В production frontend собирается с:

```env
VITE_API_URL=/api
```

Это задаётся в `docker-compose.production.yml` (build args). Браузер обращается к API на том же домене через Nginx reverse proxy.

---

## 6. Первый запуск (HTTP)

По умолчанию подключён конфиг **без SSL**:

`deploy/nginx/app.svodservice.ru.http.conf`

```bash
cd /opt/svod
docker compose -f docker-compose.production.yml up -d --build
```

Миграции применяются автоматически при старте контейнера `api` (`alembic upgrade head`).

Проверка:

```bash
docker compose -f docker-compose.production.yml ps
curl -I http://app.svodservice.ru
curl http://app.svodservice.ru/api/health
# {"status":"ok"}
```

---

## 7. Архитектура Docker Compose

```txt
Internet :80 / :443
        │
        ▼
    [nginx]  ── /api/* ──► [api:8000] ──► [db:5432]
        │
        └── /* ──► [frontend:80]  (Vite SPA static)
```

- **nginx** — единственный сервис с портами наружу (80, 443)
- **api** и **db** — только внутренняя сеть `svod_internal`
- **frontend** — внутренний Nginx со статикой и SPA fallback

Файлы:

| Файл | Назначение |
|------|------------|
| `Dockerfile` | Сборка frontend (Vite → Nginx) |
| `backend/Dockerfile` | Backend FastAPI |
| `docker-compose.production.yml` | Production stack |
| `deploy/nginx/app.svodservice.ru.http.conf` | HTTP до SSL |
| `deploy/nginx/app.svodservice.ru.conf` | HTTPS после SSL |

---

## 8. SSL (Let's Encrypt)

### Вариант A — Certbot webroot (рекомендуется с Docker)

1. Убедитесь, что HTTP работает и DNS указывает на VPS.
2. Выпустите сертификат (имена volume смотрите в `docker volume ls`):

```bash
docker run --rm \
  -v svod-production_certbot_certs:/etc/letsencrypt \
  -v svod-production_certbot_www:/var/www/certbot \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d app.svodservice.ru \
  --email admin@svodservice.ru \
  --agree-tos \
  --no-eff-email
```

> Замените `admin@svodservice.ru` на ваш email.

3. Переключите Nginx на HTTPS-конфиг в `docker-compose.production.yml`:

```yaml
# было:
- ./deploy/nginx/app.svodservice.ru.http.conf:/etc/nginx/conf.d/default.conf:ro
# стало:
- ./deploy/nginx/app.svodservice.ru.conf:/etc/nginx/conf.d/default.conf:ro
```

4. Перезапустите nginx:

```bash
docker compose -f docker-compose.production.yml up -d nginx
```

5. Проверка:

```bash
curl -I https://app.svodservice.ru
curl https://app.svodservice.ru/api/health
```

### Вариант B — Certbot на хосте (`--nginx`)

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Остановите Docker-nginx, чтобы освободить порт 80:

```bash
docker compose -f docker-compose.production.yml stop nginx
```

Выпустите сертификат (нужен временный server block на хосте или используйте standalone):

```bash
sudo certbot certonly --standalone -d app.svodservice.ru
```

Скопируйте сертификаты в volume Docker или смонтируйте `/etc/letsencrypt` в контейнер nginx, переключите на `app.svodservice.ru.conf` и запустите снова:

```bash
docker compose -f docker-compose.production.yml up -d nginx
```

### Автообновление сертификата

Добавьте в crontab на VPS:

```bash
0 3 * * * docker run --rm \
  -v svod-production_certbot_certs:/etc/letsencrypt \
  -v svod-production_certbot_www:/var/www/certbot \
  certbot/certbot renew --quiet && \
  docker compose -f /opt/svod/docker-compose.production.yml exec nginx nginx -s reload
```

---

## 9. Логи и диагностика

```bash
# Статус контейнеров
docker compose -f docker-compose.production.yml ps

# Логи всех сервисов
docker compose -f docker-compose.production.yml logs -f

# Логи API
docker compose -f docker-compose.production.yml logs -f api

# Healthcheck
curl -s https://app.svodservice.ru/api/health
```

Ручной запуск миграций (если нужно):

```bash
docker compose -f docker-compose.production.yml exec api alembic upgrade head
```

---

## 10. Обновление проекта

```bash
cd /opt/svod
git pull
docker compose -f docker-compose.production.yml up -d --build
```

При изменении только backend:

```bash
docker compose -f docker-compose.production.yml up -d --build api
```

При изменении frontend:

```bash
docker compose -f docker-compose.production.yml up -d --build frontend nginx
```

---

## 11. Локальная проверка перед деплоем

На машине разработчика:

```bash
npm run lint
npm run build
python -c "from app.main import app"   # в backend/ с установленными deps

docker compose -f docker-compose.production.yml config
docker compose -f docker-compose.production.yml build
```

---

## 12. Чеклист готовности

- [ ] DNS A `app` → IP VPS
- [ ] `.env` и `backend/.env` заполнены
- [ ] `POSTGRES_PASSWORD` и `SECRET_KEY` — уникальные
- [ ] `docker compose ... up -d --build` успешен
- [ ] `curl http://app.svodservice.ru/api/health` → `{"status":"ok"}`
- [ ] Frontend открывается в браузере
- [ ] SSL выпущен и HTTPS работает
- [ ] Логин / создание заявки работают

---

## Переменные окружения (сводка)

### Frontend (build-time)

| Переменная | Dev | Production |
|------------|-----|------------|
| `VITE_API_URL` | `http://localhost:8000` | `/api` |
| `VITE_FORMILY_RUNTIME` | `true` | `true` |

### Backend

| Переменная | Обязательна | Пример |
|------------|-------------|--------|
| `DATABASE_URL` | да | `postgresql+asyncpg://postgres:***@db:5432/myapp` |
| `SECRET_KEY` | да | случайная строка |
| `CORS_ORIGINS` | да | `["https://app.svodservice.ru"]` |
| `GIGACHAT_*` | да | из кабинета GigaChat |
| `YANDEX_MAPS_API_KEY` | нет | для подсказок адреса |
| `DADATA_API_KEY` | нет | для DaData |
| `FILE_STORAGE_BASE_URL` | да | `https://app.svodservice.ru/api/uploads` |

### Compose (корневой `.env`)

| Переменная | Описание |
|------------|----------|
| `POSTGRES_USER` | пользователь PostgreSQL |
| `POSTGRES_PASSWORD` | пароль PostgreSQL |
| `POSTGRES_DB` | имя базы |

---

## Безопасность

- Не коммитьте `.env` и `backend/.env` в git
- Порты **5432** и **8000** не публикуются наружу
- Используйте сильные пароли и уникальный `SECRET_KEY`
- Обновляйте систему и Docker-образы
