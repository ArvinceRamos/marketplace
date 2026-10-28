# Marketplace (working name)

An original, free-to-run classifieds marketplace for the Philippines. People list new or
secondhand items, chat, make offers, and arrange the deal themselves. It is inspired by the
public features of Carousell PH, but it uses none of Carousell's code, branding, or content.

Status: **Phases 1–13 done locally** — browsing, selling, chat and offers, safety tools, and a
**test-mode checkout** (simulated payments, shipping, disputes, wallet) with a moderator area.
Not deployed. Nothing in this app moves real money.

Stack: Next.js 16 (App Router, TypeScript, Tailwind) · FastAPI (Python 3.13, Pydantic) ·
Supabase (Postgres, Auth, Storage, RLS) · Docker (API only) · GitHub Actions.

Docs: [Product](docs/PRODUCT_REQUIREMENTS.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Database](docs/DATABASE_SCHEMA.md) · [API](docs/API_SPECIFICATION.md) ·
[Security](docs/SECURITY_PLAN.md) · [Free tiers](docs/FREE_TIER_LIMITATIONS.md) ·
[Roadmap](docs/IMPLEMENTATION_ROADMAP.md) · [Known limitations](docs/KNOWN_LIMITATIONS.md)

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
With the local stack running, this includes 120+ integration tests (real users, real tokens, RLS).
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
log in as `<username>@demo.test`; the script prints their local-only password. It also creates
13 demo orders in every state (unpaid, paid, shipped, delivered, completed with reviews, cancelled,
disputed, refunded, COD, a seller report on a paid meetup), 2 open reports, and a moderator: `demo_moderator@demo.test` (same password).

## Test-mode checkout (simulated payments)
Design: [Transactions design](docs/TRANSACTIONS_DESIGN.md) · research:
[Vinted and Carousell](docs/research/TRANSACTIONS_RESEARCH.md).

**Everything is simulated.** MockPay stands in for a payment provider and never asks for card or
bank details; MockCourier stands in for a courier; "Demo bank" withdrawals pay nothing out. Real
escrow in the Philippines needs a licensed payment partner (BSP rules), which is out of scope.

Try it (after `npm run db:demo`, signed in as a demo seller):
1. Open any listing → **Buy** → choose meetup or delivery, and protected payment (MockPay), cash, or
   COD. The server prices everything: item, shipping (demo flat rates), and the buyer fee (₱15 + 5%,
   online only). Sellers pay nothing.
2. MockPay: press **Simulate successful payment** (or failure). It sends a signed webhook to the API,
   exactly like a real provider would.
3. Seller, in **Account → Orders → Selling**: **Mark as shipped** (fake `DEMO-…` waybill). Use
   **Test-mode tools → Advance tracking** to move the parcel, and **Skip ahead** to make a deadline
   pass now (auto-cancel, auto-release, dispute escalation) instead of waiting days. Only the side
   that is waiting may skip: the buyer marks the parcel delivered and skips their own 2-day check;
   the seller can't skip a paid meetup's deadline for the buyer, and so on.
4. Buyer: **Everything is OK** releases the money, or **Report a problem** holds it (dispute).
   Meetups: the buyer shows a 6-digit **handover code**; the seller enters it to complete. A paid
   meetup can only be cancelled by the seller; if the buyer leaves with the item without the code,
   the seller presses **Buyer took the item** and a moderator decides. Escalated disputes with no
   decision in 14 days refund the buyer.
5. Both sides review (hidden until both review or 14 days pass). Money lands in **Account →
   Wallet**; withdraw to "Demo bank".
6. Moderator (`demo_moderator@demo.test`): **Account → Moderation** for reports (hide a listing,
   restrict an account), disputes (refund the buyer or release to the seller, with a note), users,
   and the audit log. Give another local account the role with
   `npm run db:admin -- someone@demo.test` (`--remove` to take it away), then sign in again.

Settings (`backend/.env`): `DEMO_TOOLS_ENABLED` (default on locally, off in production unless set
to `true`), `MOCKPAY_WEBHOOK_SECRET`, `MOCKCOURIER_WEBHOOK_SECRET` (dev defaults locally;
`ENVIRONMENT=production` refuses to start without real random values).

## Keep the hosted demo awake
The free hosts sleep: Render after 15 minutes without traffic (about a minute to wake), Supabase
after 7 days without activity (down until restored in the dashboard). For a portfolio link,
point a free uptime monitor at the API so both stay awake:

1. Create a free account at an uptime monitor (for example UptimeRobot or cron-job.org).
2. Add an HTTP monitor for `https://<your-render-service>.onrender.com/api/v1/health/ready`
   every 5 minutes (anything under 15 works). This endpoint runs `select 1`, so it also keeps
   Supabase active.
3. Turn on email alerts: you hear about downtime before a recruiter does.

A GitHub Actions schedule is not used: GitHub turns scheduled workflows off after 60 days
without repo activity, and on a private repo it would use more than the free minutes.
If the API is asleep anyway, the site shows "Waking up the server…" and loads by itself.

## Troubleshooting
| Problem | Fix |
|---|---|
| `uv` not found right after install | Open a new terminal (winget updates PATH for new shells) |
| `ports are not available … forbidden by its access permissions` on `db:start` | Windows reserves some port ranges. Check with `netsh int ipv4 show excludedportrange protocol=tcp` and pick free ports in `supabase/config.toml` |
| `db:start` hangs or fails | Make sure Docker Desktop is running; `docker info` should print a server version |
| Port 3100 or 8000 in use | Stop the other process, or change the port in `frontend/package.json` / the uvicorn command (update `CORS_ORIGINS` too) |
| Browser shows CORS error calling the API | `CORS_ORIGINS` in `backend/.env` must exactly match the frontend origin, e.g. `http://localhost:3100` |
| First Vitest run times out | Run it again; the first run warms up a cache. If workers keep timing out (busy PC), use `npx vitest run --maxWorkers=2` in `frontend/` |
| `Cannot find name 'PageProps'` from `tsc` | Run `npm --prefix frontend run typecheck` (it runs `next typegen` first); plain `tsc` needs the generated route types |
| A page hangs on "Compiling …" in `npm run dev` | Stop the dev server, delete `frontend/.next`, start it again. (`npm run build` can run while the dev server runs: Next.js 16 keeps dev output in `.next/dev`; checked in Phase 13) |
| `failed to decode signing keys` | Run `npm run db:keys -- --force`, then `npm run db:start` |
| API container exits at start with "Set MOCKPAY_WEBHOOK_SECRET…" | `ENVIRONMENT=production` needs both webhook secrets (random, e.g. `openssl rand -hex 32`) |
| An order page stays on its loading skeleton | Order and chat pages only poll while the browser tab is visible; switch to the tab |
| `npm run db:demo` fails removing old demo users | Run `npm run db:reset` first, then `npm run db:demo` |
| Live site shows "Waking up the server…" for minutes, or API calls return 500 after ~5 s | Open the Supabase dashboard: a paused project must be restored (its URL stops resolving while paused). Then check the uptime monitor |
| `/me` returns 503 `db_unavailable` | `DATABASE_URL` is missing in `backend/.env`, or Supabase is not running |
| Pages show "Missing NEXT_PUBLIC_…" | Create `frontend/.env.local` from `.env.example`, then restart `npm run dev` |
