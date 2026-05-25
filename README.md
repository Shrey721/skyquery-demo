# SkyQuery

SkyQuery contains a FastAPI backend, a Next.js frontend, and Docker Compose infrastructure for local supporting services.

## Configuration

Create an environment file at the repository root before starting the application:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` for your environment. The frontend is a Next.js application, but it accepts `VITE_API_BASE_URL` and `VITE_APP_ENV` from the shared root environment file for deployment consistency. Existing `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_APP_ENV` variables remain supported for local migration.

For `APP_ENV=production`, configure at minimum:

```env
FRONTEND_URL=
CORS_ORIGINS=
BACKEND_PUBLIC_URL=
SECRET_KEY=
DATABASE_URL=
VITE_API_BASE_URL=
REDIS_HOST=
TRINO_HOST=
TRINO_USER=
TRINO_CATALOG=
TRINO_SCHEMA=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=
LLM_PROVIDER=
LLM_MODEL=
```

Set the provider API key required by `LLM_PROVIDER`, where applicable. `ENABLE_MOCK_DATA` and `ENABLE_DEV_FALLBACKS` must remain `false` in production.

## Trino Connection Source

The backend supports connections saved through the UI as well as a coordinator configured with `TRINO_*` environment variables:

```env
ALLOW_SAVED_CONNECTIONS=true
TRINO_CONNECTION_SOURCE=auto
```

`TRINO_CONNECTION_SOURCE` selects the connection used for both metadata discovery and query execution:

| Value | Precedence |
| --- | --- |
| `auto` | If `ALLOW_SAVED_CONNECTIONS=true` and an active UI-saved connection exists, use it. Otherwise use `TRINO_*` from `.env`. |
| `env` | Always use `TRINO_*` from `.env`; saved connections remain stored but do not override the environment endpoint. |
| `saved` | Require and use an active UI-saved connection. If none exists, requests fail with a configuration message. |

`ALLOW_SAVED_CONNECTIONS=false` disables selection of saved connections in `auto` mode. It cannot be combined with `TRINO_CONNECTION_SOURCE=saved`. The defaults (`true` and `auto`) preserve the existing UI connection workflow.

The backend logs `active_source=saved` or `active_source=env` whenever it selects a connection, along with the configured policy and endpoint.

## Local Run

Start the currently defined infrastructure service using the shared environment file:

```bash
docker compose --env-file .env -f infrastructure/docker-compose.yml up -d
```

Start the backend:

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Start the frontend on the port configured in `.env.example`:

```bash
cd frontend
npm run dev -- --port 5173
```

Configure `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_CALLBACK_URL` for the GitHub authentication flow. Configure the Trino or Starburst variables for the coordinator that queries should use when no saved connection has been selected.
