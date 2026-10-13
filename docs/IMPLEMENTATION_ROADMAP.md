# Implementation Roadmap

Last updated: 2026-10-10

## Current state
- Phase 0: done (approved 2026-10-10).
- **Phase 1: done (2026-10-10).** Frontend, backend, Docker, local Supabase, CI config, README. CI has not run on GitHub yet (no repo).
- Repo: `C:\Users\arvince\Documents\ChatGPT\marketplace` (git initialized, nothing committed yet).
- **Exact next step:** Phase 2 (database and auth) when you say yes.

## Machine check (2026-10-10)
| Tool | Status |
|---|---|
| Node.js | v20.19.0 ✅ (Next.js 16 needs ≥ 20.9) |
| Git | 2.53 ✅ |
| Docker Desktop + WSL 2 | Docker 29.8.1, WSL 3.0.1 ✅ (works on this Windows 11 Home) |
| RAM | 15.7 GB ✅ |
| Python | 3.13.16 via uv ✅ |
| uv | 0.12.24 ✅ (winget) |
| GitHub CLI (`gh`) | ❌ not installed (optional) |
| Supabase CLI | 2.120.0 as root npm dev dependency ✅ |

## Decisions (approved 2026-10-10)
1. Install `uv` and let it install Python 3.13 — **yes** (done in Phase 1).
2. Sign-up email — **Option A**: confirmation off in the hosted project, plus Google sign-in. See FREE_TIER_LIMITATIONS §4.
3. 18+ checkbox at sign-up — **yes**.
4. Project name — **open**; working name `marketplace` until you pick one.
5. GitHub repo — **private** first.
6. Skills — official Supabase plugin (install card shown; MCP, if used: dev project, read-only).
   Three superpowers skills copied to `.claude/skills/` (markdown only, MIT).

## Phases
### Phase 1 — Foundation
- [x] `frontend/`: create-next-app 16.4.0 (upgrade to the 2026-10-14 security release when out), TypeScript strict, Tailwind, ESLint, Vitest
- [x] `backend/`: uv project, FastAPI app factory, `/api/v1/health`, settings via pydantic-settings, Ruff, pytest
- [x] `backend/Dockerfile` (slim Python, non-root user, HEALTHCHECK) + `.dockerignore`
- [x] `supabase init` (CLI as npm dev dependency); local stack starts
- [x] `.env.example` files (placeholders only)
- [x] `.github/workflows/ci.yml`: Ruff, pytest, frontend lint/typecheck/build
- [x] README: setup, run, test commands, troubleshooting
- Checks passed: Ruff + 12 pytest; ESLint, tsc, Vitest, `next build`; Docker image healthy, non-root, docs hidden in production; both apps run and the browser reaches the API (CORS). CI workflow YAML valid; first GitHub run pending.

### Phase 2 — Database and auth
- [ ] Migrations: enums, tables, constraints, indexes, triggers (profile creation, offer transitions, limits)
- [ ] `app` schema, grants, RLS policies, storage buckets + policies
- [ ] Verify `api_app` role + `SET LOCAL ROLE` approach (and pooler compatibility note)
- [ ] FastAPI JWT verification (JWKS) + DB session dependency that sets role and claims
- [ ] Frontend: Supabase SSR client, register/login/logout, protected routes, profile edit
- [ ] Tests: allowed + denied for every table/action; invalid/missing/expired tokens
- Checks: `supabase db reset` clean; pytest RLS suite green

### Phase 3 — Browsing
- [ ] Seed: categories, cities, fake users, ~60 listings, generated placeholder images
- [ ] API: categories, locations, listings search/detail, public profiles
- [ ] UI: home, search with URL filters, category pages, listing detail, seller page, loading/empty/error states
- Checks: search/filter tests; responsive check at 360 px, 768 px, 1280 px; Lighthouse accessibility pass

### Phase 4 — Seller listings
- [ ] Create/edit/status/delete API + UI (`/sell`, `/my-listings`)
- [ ] Image pipeline (Pillow), ordering, deletion
- Checks: ownership tests; upload attack tests; confirmation dialogs

### Phase 5 — Buyer–seller interactions
- [ ] Favorites, conversations, messages (polling), unread counts, offers with history
- Checks: buyer and seller journeys end to end; participant/offer/block tests

### Phase 6 — Trust, safety, polish
- [ ] Reports, blocks, safety page, privacy/terms pages, account deletion
- [ ] Accessibility pass, error/empty states, security headers/CSP
- [ ] `/security-review`, fix findings

### Phase 7 — Release readiness
- [ ] Full test suite, lint, type checks, builds, migration replay from scratch
- [ ] Re-check free-tier limits; update FREE_TIER_LIMITATIONS
- [ ] Known bugs and limitations list

### Later
- Deal completion + reviews; admin moderation; Realtime chat; reserved status; saved searches; notifications.

### Deployment (separate; only after you say "Deploy now.")
- Hosted Supabase project (second free slot), Render (Docker API), Vercel (frontend). Not planned in detail yet.

## Phase log
| Date | Phase | Result |
|---|---|---|
| 2026-10-10 | 0 | Research + docs written. Carousell site and help center read via browser (direct fetch was blocked with 403). |
| 2026-10-10 | 1 | Foundation done. Ports moved to 3100 / 544xx to run beside RvFit and avoid Windows-reserved ranges. 5 high npm audit warnings are dev-only (`braces` via lint tooling); production deps: 0. |
