# Backend (FastAPI)

## Python version

Use **Python 3.11–3.13** (recommended: **3.12**). Do **not** use **Python 3.14** for local installs unless you intend to compile native extensions yourself.

Why: packages such as **asyncpg** and **pydantic-core** ship wheels for supported CPython versions. On **3.14**, pip often falls back to building from source, which on Windows requires:

- **Microsoft C++ Build Tools** (Visual Studio Build Tools with the “Desktop development with C++” workload), and  
- for **pydantic-core**, a working Rust toolchain plus MSVC **link.exe**.

Installing [Python 3.12](https://www.python.org/downloads/) (64-bit) and creating a venv avoids those builds.

## Setup

**Easiest on Windows:** from the `backend` folder run **`.\install-deps.ps1`**. It picks **Python 3.12 / 3.13 / 3.11** via the `py` launcher when available and stops with a clear message if only **3.14+** is active (avoids `link.exe` / pydantic-core build failures).

If PowerShell blocks the script, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

Manual steps:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Run migrations and start the API per your project’s usual commands (e.g. `alembic upgrade head`, `uvicorn ...`).

### Database URL

`DATABASE_URL` must point at a host your machine can resolve.

- **`localhost`** — when Postgres is listening on your machine (e.g. `docker compose up db` exposes port **5432**).
- **`db`** — only valid **inside** the Docker Compose network (the `api` service sets this via `docker-compose.yml`). Using `db` in `.env` while running **`python -m alembic`** on Windows causes **`getaddrinfo failed`** because `db` is not a real DNS name on the host.

Align user/password/database with Postgres (see [`docker-compose.yml`](docker-compose.yml): default `postgres` / `postgres` / `myapp`).
