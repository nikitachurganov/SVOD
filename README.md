# my-app frontend

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
