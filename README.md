# Marketplace (working name)

An original, free-to-run classifieds marketplace for the Philippines. People list new or
secondhand items, chat, make offers, and arrange the deal themselves. It is inspired by the
public features of Carousell PH, but it uses none of Carousell's code, branding, or content.

Status: **Phase 3 (browsing)** — homepage, search with filters, categories, listing and seller pages work locally with demo data.

Stack: Next.js 16 (App Router, TypeScript, Tailwind) · FastAPI (Python 3.13, Pydantic) ·
Supabase (Postgres, Auth, Storage, RLS) · Docker (API only) · GitHub Actions.

Docs: [Product](docs/PRODUCT_REQUIREMENTS.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Database](docs/DATABASE_SCHEMA.md) · [API](docs/API_SPECIFICATION.md) ·
[Security](docs/SECURITY_PLAN.md) · [Free tiers](docs/FREE_TIER_LIMITATIONS.md) ·
[Roadmap](docs/IMPLEMENTATION_ROADMAP.md)

## Layout
```
frontend/   Next.js app            (port 3100)
backend/    FastAPI app            (port 8000)
supabase/   local Supabase config  (ports 54420–54429)
docs/       planning docs
```
Ports differ from the defaults (3000, 543xx) so this can run next to other local projects.

## Prerequisites (Windows)
| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20.9 | https://nodejs.org |
| uv | 0.12+ | `winget install --id astral-sh.uv --source winget` |
| Python | 3.13 | `uv python install 3.13` (uv manages it) |
| Docker Desktop | with WSL 2 | https://docs.docker.com/desktop/setup/install/windows-install/ |
| Git | any recent | https://git-scm.com |

## First-time setup
```bash
npm install
```
```bash
npm --prefix frontend install
```
```bash
uv sync --directory backend
```
Create the local JWT signing key (git-ignored; local only):
```bash
npm run db:keys
```
Copy the example env files (they contain placeholders only):
```bash
cp frontend/.env.example frontend/.env.local
```
```bash
cp backend/.env.example backend/.env
```
In `backend/.env`, set the `DATABASE_URL` password to the local-only value in `supabase/seed.sql`.
In `frontend/.env.local`, set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `npm run db:status`.
Put the same publishable key in `backend/.env` as `SUPABASE_PUBLISHABLE_KEY` (needed for photo uploads).

## Run locally
Start Docker Desktop first, then the local Supabase stack (first run downloads images, ~several minutes):
```bash
npm run db:start
```
`npm run db:status` prints local URLs and keys. Studio (database UI): http://127.0.0.1:54423.
Local auth emails are caught at http://127.0.0.1:54424.

API (http://localhost:8000, docs at http://localhost:8000/docs):
```bash
uv run --directory backend uvicorn app.main:app --reload --port 8000
```
Frontend (http://localhost:3100):
```bash
npm --prefix frontend run dev
```
Stop Supabase when done (data is kept):
```bash
npm run db:stop
```

## Checks
Backend:
```bash
uv run --directory backend ruff format --check .
```
```bash
uv run --directory backend ruff check .
```
```bash
uv run --directory backend pytest
```
With the local stack running, this includes ~70 integration tests (real users, real tokens, RLS).
They skip if Supabase is not running; set `REQUIRE_INTEGRATION=1` to make that a failure (CI does).
They refuse to run against anything but localhost.
Frontend:
```bash
npm --prefix frontend run lint
```
```bash
npm --prefix frontend run typecheck
```
```bash
npm --prefix frontend test
```
```bash
npm --prefix frontend run build
```
API Docker image:
```bash
docker build -t marketplace-api:dev backend
```
```bash
docker run --rm -p 8001:8000 marketplace-api:dev
```
Then open http://localhost:8001/api/v1/health. The image runs in production mode, so `/docs` is hidden.

CI (`.github/workflows/ci.yml`) runs the same checks on every push and pull request. It needs no secrets.

## Database migrations and seed
SQL migrations live in `supabase/migrations/` (tables, RLS, storage). `supabase/seed.sql` holds local-only data.
Re-create the local database from scratch (deletes local data):
```bash
npm run db:reset
```
New migration: add a timestamped `.sql` file to `supabase/migrations/`, then reset. Never edit a migration that has been applied to a hosted project.

### Demo data
`seed.sql` loads categories and PH cities. For sample sellers, about 50 listings, and generated
placeholder photos (simple drawn shapes, no real product photos), run after a reset:
```bash
npm run db:demo
```
It only runs against localhost and can be re-run (it replaces the previous demo data). Demo sellers
log in as `<username>@demo.test`; the script prints their local-only password.

## Troubleshooting
| Problem | Fix |
|---|---|
| `uv` not found right after install | Open a new terminal (winget updates PATH for new shells) |
| `ports are not available … forbidden by its access permissions` on `db:start` | Windows reserves some port ranges. Check with `netsh int ipv4 show excludedportrange protocol=tcp` and pick free ports in `supabase/config.toml` |
| `db:start` hangs or fails | Make sure Docker Desktop is running; `docker info` should print a server version |
| Port 3100 or 8000 in use | Stop the other process, or change the port in `frontend/package.json` / the uvicorn command (update `CORS_ORIGINS` too) |
| Browser shows CORS error calling the API | `CORS_ORIGINS` in `backend/.env` must exactly match the frontend origin, e.g. `http://localhost:3100` |
| First Vitest run times out | Run it again; the first run warms up a cache |
| A page hangs on "Compiling …" in `npm run dev` | Stop the dev server, delete `frontend/.next`, start it again. Don't run `npm run build` while the dev server is running (they share `.next`) |
| `failed to decode signing keys` | Run `npm run db:keys -- --force`, then `npm run db:start` |
| `/me` returns 503 `db_unavailable` | `DATABASE_URL` is missing in `backend/.env`, or Supabase is not running |
| Pages show "Missing NEXT_PUBLIC_…" | Create `frontend/.env.local` from `.env.example`, then restart `npm run dev` |
