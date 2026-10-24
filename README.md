# my-app frontend

## Документация

- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — запуск окружения, команды, тесты, чек-лист перед PR
- [docs/ENV.md](docs/ENV.md) — справочник переменных окружения
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — деплой, мониторинг, диагностика, откат
- [docs/DEPLOYMENT_VPS.md](docs/DEPLOYMENT_VPS.md) — первичная установка на VPS
- [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) — обзор продукта и стека

## Сервис «Опросы» (отдельная сборка)

Тот же код и тот же backend собираются в самостоятельный сервис опросов: вход и регистрация прежние, после входа — раздел «Опросы» без остальных модулей платформы (заявки, формы, участники, настройки). Режим выбирается при сборке:

```bash
npm run dev:surveys     # dev-сервер на http://localhost:5174
npm run build:surveys   # сборка в dist-surveys/
```

В сервисе нет организаций: у каждого пользователя одно личное пространство (организация с флагом `is_personal`), оно создаётся на сервере при первом входе (`POST /organizations/personal`). Опросы, созданные в организациях платформы, в этом сервисе не видны.

В Docker: `--build-arg VITE_APP_MODE=surveys`. Для хостинга нужен тот же SPA-fallback на `index.html`. Ссылки респондентов (`/survey/:token`) работают в обоих режимах.

## Routing and refresh (404 fix)

The app uses browser history routing (`createBrowserRouter`), so production hosting must rewrite unknown frontend paths to `index.html`.

Configured in this repository:

- `vercel.json` - rewrite all non-API routes to `/index.html`
- `netlify.toml` - `/* -> /index.html` redirect with HTTP 200

If you deploy behind Nginx, use:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

Without SPA fallback you will get `404` on page refresh for routes like `/requests`, `/forms/:id`, etc.
