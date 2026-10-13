# Implementation Roadmap

Last updated: 2026-10-13

## Current state
- Phase 0: done (approved 2026-10-10).
- **Phase 1: done (2026-10-10).** Frontend, backend, Docker, local Supabase, CI config, README. CI has not run on GitHub yet (no repo).
- Repo: `C:\Users\arvince\Documents\ChatGPT\marketplace` (commits f919f9e, 9af2e03; Phase 3 not committed yet).
- **Phase 2: done (2026-10-10).** Schema, RLS, storage policies, JWT verification, sign-up/login/logout, profile view/edit.
- **Design system: done (2026-10-13).** See `docs/DESIGN_SYSTEM.md`.
- **Phase 3: done (2026-10-13).** Demo data, browse API, homepage, search + filters, category, listing, seller pages.
- **Exact next step:** Phase 4 (seller listings) when you say yes.

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
- [x] Migrations: enums, tables, constraints, indexes, guard triggers (profile creation + 18+ rule, listing status, offers, read markers, limits)
- [x] `app` schema (not exposed), revoke-then-grant, RLS on every table, storage buckets + owner-folder policies
- [x] `api_app` role (NOINHERIT, SET-only grants) + per-request `SET LOCAL ROLE` and JWT claims
- [x] Local ES256 signing key (`npm run db:keys`); FastAPI verifies tokens via JWKS (HS256 rejected)
- [x] API: `/me` (GET, PATCH), `/health/ready`; DB errors mapped to safe 403/409/422
- [x] Frontend: `@supabase/ssr`, `proxy.ts` session refresh + route guard, register (18+), login, logout, profile view/edit
- [x] Tests: 29 unit + 72 integration (every table: allowed and denied; bad/expired/forged tokens; storage folders); frontend 15
- Checks passed: Ruff; pytest 101/101 on full and CI-like reduced stack; ESLint; tsc; Vitest 15/15; `next build`; browser run-through (guard, 18+ block, register, profile save, friendly errors, logout, mobile width)
- Open: hosted pooler + `api_app` login to verify at deploy; Google sign-in not configured yet (needs a Google OAuth client)

### Phase 3 — Browsing
- [x] Seed: 29 categories (2 levels) and 59 PH cities in `seed.sql`; `npm run db:demo` adds 8 sellers, 50 listings, 99 generated photos (local only, re-runnable)
- [x] API: `/categories`, `/locations`, `/listings` (search, filters, sort, pagination), `/listings/{id}`, `/profiles/{username}`, `/profiles/{username}/listings`
- [x] UI: home, `/search` (URL filters), `/categories/[slug]`, `/listing/[id]`, `/seller/[username]`, skeletons, empty states, `not-found`, `error` (server waking)
- Checks passed: Ruff; pytest 122/122 (19 browse tests incl. 422s and visibility); ESLint; tsc; Vitest 24/24; `next build` with no API and with CI env only; browser at 375, 768, 1280 px (no horizontal scroll), filters, detail, not-found
- Not done: Lighthouse accessibility audit (moved to Phase 6 polish). Not-found pages return HTTP 200 + `noindex` because they stream (acceptable for now)
- Fixed during phase: account deletion failed when a user had offers or had been reported (offer guard + report constraint); test cleanup now fails loudly; search also matches category names; corrupted dev cache documented

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
| 2026-10-10 | 2 | Database + auth done. Fixed during the phase: guard triggers needed caller rights; username lowercased before pattern check; outsider offers now fail as "not allowed"; dark-mode contrast (site is light-only until Phase 3). Supabase JS warns Node 20 is deprecated; plan a move to Node 22. |
| 2026-10-13 | 2.5 | Design system: tokens + primitives in `globals.css`, Inter font, deep-indigo accent, Button/ButtonLink/TextLink/layout primitives; existing pages migrated. Rules in `docs/DESIGN_SYSTEM.md`. Checks: ESLint, tsc, Vitest 15/15, `next build`, browser check desktop + 375px. |
| 2026-10-13 | 3 | Browsing done. Found and fixed an account-deletion bug (offer guard + report constraint) via leftover test users. Decision: deleting a seller removes their listings and the chats about them (docs updated). |
