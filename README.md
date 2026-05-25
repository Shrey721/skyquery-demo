# SkyQuery

SkyQuery is a local-first application with a FastAPI backend, a Next.js frontend, Redis-backed session/cache state, GitHub OAuth/Copilot integration, and an external Trino or Starburst query endpoint.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `backend/` | FastAPI API, OAuth routes, Redis/session access, metadata discovery, Trino execution, SQLite runtime database, and Python tests. |
| `frontend/` | Next.js client application. |
| `infrastructure/docker-compose.yml` | Redis service for local development. |
| `.env.example` | Shared root configuration template used by the backend and frontend build configuration. |

Important Git detail: `frontend/` contains its own `.git` directory and is recorded in the root repository as a gitlink. The root repository currently has no `.gitmodules` entry for it, so treat it as a nested repository rather than a normally configured submodule when checking status or preparing changes. A fresh root clone may need the frontend repository content supplied separately until that Git metadata is repaired.

## Runtime Model

The current local run model is:

1. Redis runs through Docker Compose from `infrastructure/docker-compose.yml`.
2. The FastAPI backend runs manually from `backend/`.
3. The Next.js frontend runs manually from `frontend/`.
4. Trino or Starburst is external to this Compose setup. Backend metadata and query operations select a UI-saved connection or root `.env` settings according to `TRINO_CONNECTION_SOURCE`.

Redis is required for metadata selection cache and for GitHub OAuth/Copilot session state. Start it before authenticating or querying.

## Configuration

Create the shared root environment file:

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

After installing backend dependencies, generate a persistent Fernet key for `SECRET_KEY` and put the resulting value in root `.env`:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

On Windows after creating the backend virtual environment:

```powershell
backend\venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Keep this key stable. Changing it prevents decryption of Trino passwords already stored in `backend/connections.db`.

### URLs And Redis

For the documented local ports (`backend:8000`, `frontend:5173`), set:

```env
BACKEND_PUBLIC_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8000
GITHUB_CALLBACK_URL=http://localhost:8000/api/v1/auth/github/callback
REDIS_HOST=localhost
REDIS_PORT=6379
```

The backend is currently started on the host machine, so it reaches Docker-published Redis as `localhost`. If the backend is later run inside Compose on the same network, use `REDIS_HOST=redis` instead.

The documented backend and frontend start commands pass ports explicitly. When changing `BACKEND_PORT` or `FRONTEND_PORT` in `.env`, change the corresponding command-line port and URL variables at the same time.

### Frontend Environment Handling

The dependable frontend configuration path today is root `.env`:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_ENV=development
```

`frontend/next.config.mjs` loads the root environment and exposes these values to the Next.js application. The source also references `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_APP_ENV`, and `frontend/.env.local` may exist locally, but the current manual environment-loading order does not make `frontend/.env.local` a reliable override of the root values. There is no tracked `frontend/.env.example` at present. Use root `.env` for handoff and deployment configuration unless the frontend loading logic is changed.

### GitHub OAuth And Sessions

Configure at minimum:

```env
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:8000/api/v1/auth/github/callback
FRONTEND_URL=http://localhost:5173
```

Register the exact `GITHUB_CALLBACK_URL` in the GitHub OAuth application. The callback reaches the backend; after authentication the backend redirects the browser to `FRONTEND_URL`. If hostnames or ports change, update GitHub configuration, `GITHUB_CALLBACK_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, and `VITE_API_BASE_URL` together.

OAuth access tokens and restored session IDs are stored in Redis. If Redis is stopped, authentication/session restoration and queries requiring a live Copilot token will fail.

## Trino Connection Source

The backend supports both UI-saved connections and the `TRINO_*` values in root `.env`:

```env
ALLOW_SAVED_CONNECTIONS=true
TRINO_CONNECTION_SOURCE=auto
```

The same selected connection source is used for metadata discovery and query execution:

| Value | Behavior |
| --- | --- |
| `auto` | When `ALLOW_SAVED_CONNECTIONS=true` and a UI-saved active connection exists, use the saved connection. Otherwise use the `TRINO_*` environment values. |
| `env` | Always use `TRINO_*` environment values. Saved connections remain stored but do not override them. |
| `saved` | Require a UI-saved active connection. Requests fail with a configuration message if none exists. |

`ALLOW_SAVED_CONNECTIONS=false` disables use of UI-saved connections in `auto` mode. It cannot be combined with `TRINO_CONNECTION_SOURCE=saved`. The default pair, `true` and `auto`, preserves the UI onboarding workflow and gives a saved active connection precedence over the environment fallback.

The backend logs the selected source as `active_source=saved` or `active_source=env`.

Current UI note: frontend startup still checks for an active saved connection and may show the connection setup screen even when `TRINO_CONNECTION_SOURCE=env`. The source policy controls backend metadata/query connection selection; it does not currently remove the UI onboarding step.

## Local Setup And Run

### 1. Install Backend Dependencies

```powershell
cd backend
py -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

On Unix-like shells, activate or run the equivalent `backend/venv/bin/python` commands.

### 2. Start Redis

From the repository root:

```bash
docker compose --env-file .env -f infrastructure/docker-compose.yml up -d
```

### 3. Start The Backend

```powershell
cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Install And Start The Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev -- --port 5173
```

Open `http://localhost:5173`, sign in through GitHub, then complete the Trino/Starburst connection setup shown by the UI. When `TRINO_CONNECTION_SOURCE=env`, backend metadata and query operations use `.env` settings even if a saved connection is retained for the current onboarding flow.

## Tests

Backend unit tests are present under `backend/test_*.py`. From `backend/`:

```powershell
venv\Scripts\python.exe -m unittest test_trino_connection_source.py test_starburst_executor_retry.py
venv\Scripts\python.exe -m unittest test_metadata_filter.py test_result_intent.py
```

Some integration-style scripts require running Redis, valid OAuth/session state, or a reachable Trino/Starburst endpoint.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Invalid Fernet key or failure decrypting a saved connection password | `SECRET_KEY` must be a valid Fernet key and must match the key used when credentials were saved. Generate it once, keep it in `.env`, and reconnect/save credentials if the key changed. |
| `Live Copilot session expired or unavailable` | Start Redis, sign in through GitHub again, and verify the frontend is reaching the same backend that handled the OAuth callback. |
| Redis connection refused | Start Compose; for a manually run backend use `REDIS_HOST=localhost`. Only a backend running inside the Compose network should use `REDIS_HOST=redis`. |
| Trino `JDBC_ERROR` or a transient first-query connection failure | Confirm the selected source in backend logs, verify coordinator/connector availability and credentials, then retry; transient connector failures are retried according to `TRINO_QUERY_MAX_RETRIES`. |
| Browser CORS errors or API requests go to the wrong host | Keep `FRONTEND_URL`, `CORS_ORIGINS`, `VITE_API_BASE_URL`, backend port, and OAuth callback URL aligned. Restart frontend/backend after changing environment values. |
| Frontend API environment value appears not to load | Put `VITE_API_BASE_URL` in root `.env`; do not rely on `frontend/.env.local` overriding it in the current configuration. Restart `next dev` after updating `.env`. |

## Do Not Commit

Do not commit secrets or local/generated runtime state:

- `.env` or any secret-bearing environment file
- `frontend/.env.local`
- `backend/connections.db`
- `node_modules/`
- `.next/`
- logs, Redis dumps, cache directories, or credentials/tokens

The root `.gitignore` already ignores `.env`, `*.db`, `node_modules/`, and logs; `frontend/.gitignore` ignores `.env*.local` and `.next/`.
