# Деплой сервиса опросов (surveys.svodservice.ru)

Отдельный стек `docker-compose.surveys.yml`: frontend в режиме `surveys` + backend + worker + PostgreSQL + nginx.
Сервер: `194.58.118.39`, домен: `surveys.svodservice.ru`. Общая справка по VPS — [DEPLOYMENT_VPS.md](./DEPLOYMENT_VPS.md).

## 1. DNS
A-запись `surveys` → `194.58.118.39` (проверка: `nslookup surveys.svodservice.ru`).

## 2. Сервер (Ubuntu)
```bash
ssh root@194.58.118.39
apt update && apt install -y git curl
curl -fsSL https://get.docker.com | sh
git clone REPOSITORY_URL /opt/svod && cd /opt/svod
```
Порты 80 и 443 должны быть открыты (`ufw allow 80,443/tcp`).

## 3. Env
```bash
cp .env.surveys.example .env                  # задать POSTGRES_PASSWORD
cp backend/.env.surveys.example backend/.env  # задать SECRET_KEY, OPENROUTER_API_KEY, SMTP_*
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # для SECRET_KEY
```
S3 нужен только операциям с файлами заявок; опросам он не требуется, значения-заглушки можно оставить.
Без `SMTP_HOST` письма (сброс пароля) не отправляются — ссылка пишется в лог `api`.

## 4. Запуск по HTTP
```bash
docker compose -f docker-compose.surveys.yml up -d --build
curl http://surveys.svodservice.ru/api/health   # {"status":"ok"}
```

## 5. HTTPS
```bash
docker run --rm \
  -v svod-surveys_certbot_certs:/etc/letsencrypt \
  -v svod-surveys_certbot_www:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d surveys.svodservice.ru --email YOUR_EMAIL --agree-tos --no-eff-email
```
Затем в `.env` поставить `NGINX_CONF=surveys.svodservice.ru.conf` и:
```bash
docker compose -f docker-compose.surveys.yml up -d nginx
```
Продление — cron из раздела 8 `DEPLOYMENT_VPS.md` с томами `svod-surveys_*` и файлом `docker-compose.surveys.yml`.

## 6. Обновление
```bash
cd /opt/svod && git pull && docker compose -f docker-compose.surveys.yml up -d --build
```
