# Implementation Roadmap

Last updated: 2026-10-14

## Current state
- Phase 0: done (approved 2026-10-10).
- **Phase 1: done (2026-10-10).** Frontend, backend, Docker, local Supabase, CI config, README. CI has not run on GitHub yet (no repo).
- Repo: `C:\Users\arvince\Documents\ChatGPT\marketplace` (commits f919f9e, 9af2e03, 8ddb0e1, 1a184f8, de2b157, 66dc74a, fa62b0a, 5bb4f56).
- **Phase 2: done (2026-10-10).** Schema, RLS, storage policies, JWT verification, sign-up/login/logout, profile view/edit.
- **Design system: done (2026-10-13).** See `docs/DESIGN_SYSTEM.md`.
- **Phase 3: done (2026-10-13).** Demo data, browse API, homepage, search + filters, category, listing, seller pages.
- **Phase 4: done (2026-10-13).** Create/edit/status/delete, photo pipeline, `/sell`, `/my-listings`, edit page.
- **Phase 5: done (2026-10-13).** Favorites, chat with polling, unread badge, offers, inbox, Account menu.
- **Phase 6a: done (2026-10-13), committed 66dc74a.** Reports, blocks, account deletion, rate limits, `/settings`.
- **Phase 6b: done (2026-10-13), committed fa62b0a.** Safety/privacy/terms pages, footer, a11y + Lighthouse, retry states, headers/CSP, security review.
- **Phase 7: done (2026-10-13), committed 5bb4f56.** Sizes, follow sellers + feed, deal options (labels only).
- **Phase 8: done (2026-10-13), committed e9d92b8.** Release checks; see docs/KNOWN_LIMITATIONS.md.
- **Phase 9: done (2026-10-13).** Transactions research + design (docs only). Phases 10–13 approved in the same message ("do everything from phase 9 to 13").
- **Phase 10: done (2026-10-13).** Test-mode checkout: orders, MockPay + signed webhooks, ledger, wallet, reserved listings.
- **Phase 11: done (2026-10-13).** Shipping + MockCourier tracking, handover code, COD, auto-complete, demo tools, double-blind reviews.
- **Phase 12: done (2026-10-13).** Disputes, admin role, reports queue, hide listings, restrict users, audit log, `/admin`.
- **Phase 13: done (2026-10-13).** Release checks, demo orders in every state, README test-mode guide, limitations, security review.
- **Phase 14: done (2026-10-14).** Audit fixes (`docs/AUDIT_2026-10-13.md`): demo tools can't release escrow, paid meetups seller-cancel only + seller report, unpaid-order cap, reserved/restricted listings frozen, 14-day dispute fallback, image memory limits, rate limits, viewer endpoint, cached reference lists.
- **Phase 15: done (2026-10-14).** Listing, seller, and profile pages redesigned from Claude Design; avatar upload; city picker; seller sold count.
- **Not committed yet** (Phases 14 and 15 are in the working tree). The Claude Design export (`docs/design/claude-design*`) is git-ignored; the bundle `.md` is tracked.
- **Exact next step:** your call. Check by hand (below), then commit. Before a public launch: KNOWN_LIMITATIONS §1 (privacy contact, Next.js security release (not out on 2026-10-14; still 16.4.0), GitHub repo + first CI run, someone to watch `/admin`), and check `httpx2` on PyPI (audit A10). Deployment only after you say "Deploy now."

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
- [x] API: `POST/PATCH/DELETE /listings`, `POST /listings/{id}/status`, `GET /me/listings`; photos add/reorder/delete
- [x] Image pipeline (Pillow): content check, pixel limit, EXIF rotation, WebP full 1600px + thumb 600px, no metadata; uploads with the seller's own token
- [x] Body size limit middleware; DB trigger: an active listing keeps ≥1 photo
- [x] UI: `/sell` (photos kept in browser until submit), `/my-listings` tabs with actions, `/my-listings/[id]/edit`, owner bar on listing page, Sell/My listings in header, confirm dialogs (Mark sold, Delete)
- Checks passed: Ruff; pytest 157/157 (12 image unit + 23 selling integration); ESLint; tsc; Vitest 42/42; `next build`; browser: validation, publish with 2 photos, reorder, remove, last-photo refusal, mark sold (dialog), delete (dialog), form reset, 375 px
- Not done: rate limits (create 30/day, uploads 60/hour) — no limiter exists yet; plan for Phase 6. Client-side photo shrinking before upload (saves mobile data) not built
- Learned: Auth deletes users who still own Storage files and leaves the files behind; account deletion (Phase 6) must remove them first

### Phase 5 — Buyer–seller interactions
- [x] API: favorites (+ IDs for hearts), start chat, inbox, thread, messages (before/after paging), read markers, unread count, offers (make/accept/decline/withdraw, history)
- [x] DB: `app.expire_stale_offers` (lazy 7-day expiry); fixed message guard so offer notes still work after a buyer deletes their account
- [x] UI: hearts on cards and listing page, `/favorites`, Chat/Open chat on listing page, `/inbox` (side by side on desktop, one at a time on phones), thread with offers, header Inbox badge + Account menu
- Checks passed: Ruff; pytest 167/167 (10 new social tests incl. a regression test proven to fail on the old guard); ESLint; tsc; Vitest 57/57; `next build`; browser: buyer saves, chats, offers; seller sees unread badge, accepts with confirm; live status update while the chat is open; logout leaves login form empty; 375 px with no sideways scroll; polling rate measured
- Fixed during phase: offer cards kept an old status; polling burst on quick tab switches; login/register kept typed passwords in hidden pages; chat column overflow on phones; header 2 px too wide on phones
- Not done: `favorite_count` on cards (needs a counting function; deferred); block/unblock UI and hiding blocked chats (Phase 6, the DB already blocks messaging)

### Phase 6 — Trust, safety, polish
Split into 6a and 6b (approved 2026-10-13). Decisions: own in-process rate limiter (no `slowapi`);
block/report users by username; static CSP without nonces (keeps static shells; 6b); local secret
key in `backend/.env`; Lighthouse via one-off `npx lighthouse` (6b).

**6a — trust and safety core (done 2026-10-13)**
- [x] API: `POST /reports`, `GET /me/reports`, `PUT/DELETE /users/{username}/block`, `GET /me/blocks`, `DELETE /me`
- [x] Blocked chats hidden from the blocker's inbox and unread count; chat detail adds `blocked_by_me`; blocked side can't message and isn't told why
- [x] Account deletion: Storage files (own token, recursive list) → Auth user (secret key, its only use, logged); 503 without key, 502 if Storage fails (nothing deleted)
- [x] Rate limits (API spec §3) on chats, messages, offers, listings, photos (per photo), reports, blocks, search (per IP; `TRUSTED_PROXY_HOPS`)
- [x] UI: "Report this listing"; "•••" menu (Report / Block / Unblock) on seller page and chats with confirm dialog; `/settings` (blocked users, your reports, log out, delete account); Settings in Account menu
- Checks passed: Ruff; pytest 182/182 (8 limiter unit + 7 safety integration incl. real Storage + Auth deletion); ESLint; tsc; Vitest 67/67; `next build`; browser: report listing, duplicate note, block from chat (chat leaves inbox, composer closed), unblock in Settings, menu hidden on own profile, guest → login, delete account (36 files → 0, Auth user and listings gone), 375 px no sideways scroll
- Fixed during phase: flaky `test_participants_exchange_messages` (no `order by`); `/settings` now drops account data when hidden
- Not done (6b or later): header unread badge updates on its next 30 s poll after a block, not at once; `/profile` still keeps data in its hidden page after logout (same fix as settings); `<summary>` menus show as "generic" in the accessibility tree (check in the a11y pass)

**6b — pages and polish (done 2026-10-13)**
- [x] `/safety` (payments, meetups, scams, report/block, prohibited items), `/privacy` (RA 10173, not legal advice), `/terms`; site footer links them; sign-up form links terms + privacy; chat banner links safety tips
- [x] Accessibility: skip link; heading order on search/category/favorites; low-contrast text (`fg-subtle`, 3.1:1) replaced in 7 places; new `fg-placeholder` (4.8:1) for inputs; anchor targets clear the sticky header
- [x] Lighthouse 13.5 (one-off `npx`, mobile, production build): accessibility 100 on 17 pages (10 public, 7 signed-in with a real session); best practices 100; layout shift from the new footer fixed
- [x] Error/empty states: "Try again" on every account page that can fail to load (`LoadError`); chat now shows "Could not load earlier messages" (was silent); `/profile` and `/profile/edit` drop data when hidden; edit form no longer stuck on "Saving…" after coming back
- [x] Security headers + static CSP in `next.config.ts` (SECURITY_PLAN §3c, §7)
- [x] Security review of 6a + 6b (by hand; `/security-review` needs a git remote): no vulnerabilities found
- Checks passed: Ruff; pytest 182/182; ESLint; tsc; Vitest 74/74 (+7: headers, footer, retry); `next build` (new pages static); browser: headers present, CSP blocks outside script + fetch, sign-up, profile edit, listing photos, chat, account deletion and dev hot reload all work under CSP; skip link by keyboard; retry after a forced failure; 375 px no sideways scroll on new pages, settings, chat
- Not done / notes: Lighthouse performance 71–93 on a throttled mobile profile (mostly script blocking time; not tuned); `<summary>` menus pass Lighthouse but were not tried with a real screen reader; privacy contact address still to add before launch; API JSON responses have no security headers (Phase 7); `.claude/launch.json` gained a `frontend-prod` entry (`next start`) for audits

### Phase 7 — Closets, sizes, deal options (approved 2026-10-13)
Why: PH thrift buyers shop by size and follow sellers they like; buyers want to know up front
if a seller takes GCash/Maya or ships by J&T etc. Payments and couriers stay **outside** the app
(no escrow, no courier APIs: they need a registered business, fees, and BSP rules; ₱0 rule).
- [x] Sizes: `size_options` table + `categories.size_group`; optional size on Women's/Men's Fashion (XXS–4XL, Free size), Shoes (EU 35–47), Kids' Clothing (age ranges); DB trigger + API check; size on cards and listing page; size filter on those subcategories
- [x] Follow sellers: `follows` table (private under RLS), public `follower_count`, Follow button on seller page, `/following` (sellers + feed), Account menu link; blocking ends follows both ways; 60/hour limit, max 1,000
- [x] Deal options: payment methods (GCash, Maya, bank transfer, cash on meetup, COD) and couriers (J&T, Flash, LBC, Lalamove, Grab) on the sell/edit form, listing page, and as filters; COD/couriers need delivery, cash needs meetup (API 422 + DB checks)
- [x] Demo data (sizes from titles, deal options), privacy page updated (follows), docs (schema, API, flows, security T21–T22)
- Migration: `20261013000300_closets_sizes_deals.sql`; replayed from scratch with `supabase db reset` (local), demo data reloaded
- Checks passed: Ruff; pytest 191/191 (9 new: sizes, deal options, filters, follows, RLS); ESLint; tsc; Vitest 83/83 (+9); `next build`; Lighthouse accessibility + best practices 100 on fashion category, seller, listing, and payment-filtered search; browser: size filter (EU 42 → 1 item), payment+courier filter, listing details, sign-up, follow → 1 follower → `/following` feed, sell form (size appears with Shoes, couriers and COD with Delivery), draft saved and edit form prefilled, 375 px no sideways scroll; test account deleted (its follow removed)
- Not done / notes: no "my sizes" saved preference; size filter only on a subcategory (not "All Fashion"); demo photos still draw a shirt for shoes; Vitest needed `--maxWorkers=2` on this machine (worker start-up timeouts when the machine is busy)

### Phase 8 — Release readiness (done 2026-10-13)
- [x] Full test suite, lint, type checks, builds, migration replay from scratch
- [x] Re-check free-tier limits; update FREE_TIER_LIMITATIONS (Render: 512 MB / <1 CPU confirmed; Hobby 5 GB bandwidth and 500 build minutes, services suspended when bandwidth runs out without a payment method; Vercel adds 10 GB Fast Origin Transfer; Supabase, GitHub, auth emails unchanged)
- [x] Known bugs and limitations list (`docs/KNOWN_LIMITATIONS.md`)
- [x] Found and fixed: `npm run typecheck` failed on a clean checkout (route types live in the ignored `.next`), so CI would have failed; it now runs `next typegen` first
- [x] Added: CI `secrets` job (SECURITY_PLAN T16 promised it); security headers on API responses (tested)
- Checks passed: `supabase db reset` replays all 6 migrations + seed; Ruff; pytest 193/193 on the fresh database (+2 header tests); ESLint; typecheck from a clean state; Vitest 83/83; `next build`; Docker image builds, healthy, runs as `appuser`, docs 404 in production, headers present; `npm audit` production 0 (5 high dev-only, `braces` via ESLint tooling); `pip-audit` 0 known; secret grep of tracked files and git history clean; CI YAML parses
- Not done: CI has still never run on GitHub (no repo); Next.js security release (due 2026-10-14) not out yet

### Phase 9 — Transactions research and design (done 2026-10-13)
Approved: built-in MockPay (no provider account), simulated COD, buyer fee ₱15 + 5%, seller fee ₱0.
- [x] Research (two subagents, Vinted + Carousell help centres): `docs/research/TRANSACTIONS_RESEARCH.md`
- [x] Design: `docs/TRANSACTIONS_DESIGN.md` (order types, amounts, state machine, timers, MockPay + signed webhooks, ledger, fulfilment, disputes, reviews, admin, test-mode tools)
- [x] Updated PRD (non-goals → "real" payments; §9 scope), DATABASE_SCHEMA §9, API spec (orders, webhooks, admin, limits), SECURITY_PLAN T23–T32, USER_FLOWS §9–10, ARCHITECTURE (`app_integrations`, definer functions)
- Checks: docs only; cross-read for consistency (states, timers, endpoints, threats). No code changed.

### Phase 10 — Simulated payments core (done 2026-10-13)
- [x] Migrations `20261013000400_reserved_status.sql` (enum value alone: it can't be used in the transaction that adds it) and `20261013000500_orders_payments.sql`: order/payment/ledger enums, orders, order_secrets, payments, provider_events, ledger (zero-sum deferred trigger, append-only trigger), `app_integrations` role, definer functions (terms/quote/create/cancel/tick, payment start/succeeded/failed, withdraw), profile delete guard, RLS (read-only for users)
- [x] Errors from definer functions use SQLSTATE `MKnnn` + hint; `app.core.errors.db_app_error` maps them (one mechanism for every money function)
- [x] Backend: `app/integrations/` (signing, MockPay with provider protocol), `app/api/v1/orders.py` (checkout, quote, orders, pay, cancel, wallet, withdraw, webhook; demo router for MockPay buttons, mounted only with demo tools), settings (`DEMO_TOOLS_ENABLED`, webhook secrets; production refuses dev secrets), account deletion refuses open orders / balance, listing `reserved` handling, `my_open_order_id` on listing detail
- [x] Frontend: Buy button + "View your order", `/checkout/[listingId]` (server-priced summary), `/pay/mock/[ref]`, `/orders` (Buying/Selling), `/orders/[id]` (status, deadline, handover code, pay/cancel, 15 s polling), `/wallet` (balances, history, withdraw), test-mode notice, "Buy at ₱X" on an accepted offer in chat, Reserved tab/badge/banner, Account menu (Orders, Wallet), route guard, safety/footer copy
- Checks passed: Ruff; pytest 13 new unit (signing, MockPay, settings, demo routes off) + 12 new integration (quotes and option rules, offer price, reserve/pay/refund, cash+COD, forged/stale/unsigned/wrong-amount/duplicate webhooks, late payment refund, abandoned checkout frees the listing, ship/meet deadlines, wallet withdraw, ledger read-only even for superuser, account deletion waits); full backend 218 before the final production-settings test fix, then that test passed; ESLint; typecheck; Vitest 90/90 (+7); migrations replayed with `supabase db reset`; demo data reloaded; browser: listing → Buy → checkout (meetup/delivery switch, ₱695 + ₱15 fee, courier fee) → MockPay → order confirmed with ship-by deadline; orders list; wallet shows the payment; 375 px no sideways scroll on checkout, orders, wallet
- Notes: `next build` deferred to Phase 13 (dev server running); `ENVIRONMENT=production` (Docker image) now needs `MOCKPAY_WEBHOOK_SECRET` and `MOCKCOURIER_WEBHOOK_SECRET`; test cleanup closes test users' orders and zeroes balances as superuser before deleting them

### Phase 11 — Fulfilment, completion, reviews (done 2026-10-13)
- [x] Migration `20261013000600_fulfilment_reviews.sql`: shipments + events (forward-only), COD remittance in the ledger, ship / confirm received / handover (5 tries, returns a result so wrong tries are saved) / new code, `shipment_event` and `demo_fast_forward` for `app_integrations`, 2-day auto-complete timer, reviews (one per side, 30 days, public when both wrote or after 14 days), `rating_summary`, `public_reviews`
- [x] Backend: `app/integrations/mockcourier.py`, routes for ship, confirm-received, handover, handover-code, review, `/profiles/{username}/reviews`, `/shipping/webhooks/mock`; demo routes `/mock-courier/orders/{id}/advance`, `/demo/orders/{id}/fast-forward`; order detail adds shipment, reviews, `actions` incl. demo tools; profile adds rating
- [x] Frontend: order page actions with confirm dialogs, handover form, tracking timeline (waybill marked demo), "Test-mode tools" box (Advance tracking, Skip ahead), review form and cards; seller page rating line + public reviews
- Checks passed: Ruff; pytest 227/227 (+8 integration: delivery release with fee/courier split, auto-complete, COD remittance, forged/duplicate/backward courier webhooks, handover lock + new code, cash meetup, fast-forward only for participants, double-blind reviews and profile rating; +1 unit: MockCourier, demo routes off); ESLint; typecheck; Vitest 93/93 (+3: handover form, review form, tracking); browser as seller: Mark as shipped (dialog) → 4× Advance tracking → Delivered with auto-complete time → Skip ahead → Completed → 5-star review (blind note shown) → wallet ₱13,900 → withdraw ₱500 → ₱13,400
- Fixed during phase: the order page mounted its confirm dialog only when needed, and the dialog's close-on-unmount ran during React's dev double mount, so it closed at once (Phase 10's Cancel was affected too). Now always mounted, like other pages.
- Note: order pages poll only while the tab is visible (same as chat); a page opened in a hidden tab loads when shown

### Phase 12 — Disputes and admin moderation (done 2026-10-13)
- [x] Migration `20261013000700_admin_disputes.sql`: `app.is_admin()` (signed `app_metadata.role`), `profiles.restricted_at` + `app.is_restricted`, restricted users blocked by the insert policies (listings, chats, messages, offers), a publish guard, and `order_terms`; disputes (open / seller refund or contest / buyer withdraw / escalate, 48 h timer, refund marks the item sold: no returns); admin functions (resolve dispute, report status, listing moderation, restriction) that check `is_admin()` and write `admin_actions`; admin read policies; admin timer tick
- [x] Backend: `app/api/v1/admin.py` (route-level role check) + `app/services/admin.py`; dispute routes on orders; `/me` adds `is_admin`, `restricted`; profile adds `restricted`; chat detail adds `other_restricted`; listing detail adds `hidden`; friendly 403 `restricted` before the database check; `npm run db:admin -- <email> [--remove]` (local only)
- [x] Frontend: `/admin` (overview, reports with hide/restrict, disputes with refund/release + required note, users search + restrict/lift, audit log), "Moderation" in the Account menu for moderators, dispute panel on orders (report, contest, refund, withdraw, ask a moderator), restricted warnings (chat, seller page), hidden notice on the edit page
- Checks passed: Ruff; pytest 235/235 (+6 integration: admin role from the signed token only (user_metadata ignored), DB refuses non-admins, report → hide + restrict + audit, restricted user blocked everywhere incl. RLS, seller refund, contest → moderator release, unanswered → escalated → moderator refund, withdraw, COD has no disputes; +2 unit: request schemas); ESLint; typecheck; Vitest 96/96 (+3); browser as a local demo moderator: Moderation menu link, overview counts, user search, restrict + lift with confirm dialogs, audit log entries
- Fixed during phase: optional text fields (`note`, `comment`, `details`) returned 500 when sent as `null` (Pydantic constraint on `str | None`); now constrained on `str` with a regression test. The review form sends `null` for an empty comment, so this also affected Phase 11 reviews without a comment.
- Note: an unhandled 500 has no CORS headers, so the browser shows "Can't reach the server" instead of the generic error (known since Phase 8, SECURITY_PLAN §3c)

### Phase 13 — Release and portfolio polish (done 2026-10-13)
- [x] Demo data: `scripts/demo_orders.py` adds 12 orders in every state (unpaid, paid to ship, paid meetup, in transit, delivered, completed + reviews, cash meetup + reviews, cancelled + refunded, contested dispute, seller refund, COD, open dispute), 2 open reports, and `demo_moderator@demo.test`; all through the same database functions; re-runs settle old demo orders and balances first
- [x] Docs: README (status, test-mode guide, troubleshooting), KNOWN_LIMITATIONS (§1 moderation built, #7 test mode, §4 checkout limits), ARCHITECTURE routes, SECURITY_PLAN (T10, Phases 10–13 review), DATABASE_SCHEMA and TRANSACTIONS_DESIGN status
- [x] CI: the Docker job now passes random webhook secrets (production refuses to start without them)
- Checks passed: `supabase db reset` replays all 10 migrations + seed; demo data loads twice in a row; Ruff; pytest 235/235 (one test assumed no public reviews existed and failed with demo data loaded; scoped to its own order); ESLint; typecheck; Vitest 96/96; `next build` (all new routes build; ran beside the dev server, which kept working); Docker image: exits without secrets, healthy with them, runs as `appuser`, demo routes and docs 404; Lighthouse 13.5 (production build, mobile) accessibility 100 and best practices 100 on the seller page (rating + reviews) and login; signed-in pages checked in the browser (labels, names, headings, duplicate IDs, 375 px no sideways scroll) on orders (meetup with code, disputed), wallet, admin disputes/reports/log; moderator released an escalated dispute through the UI (note required, confirm dialog, audit entry); `npm audit --omit=dev` 0; secret grep clean; no new dependencies (pip-audit not rerun)
- Fixed during phase: idle confirm dialog on the order page had an empty button label; demo dispute text was item-specific

### Phase 14 — Audit fixes (done 2026-10-14)
Decisions (2026-10-14): paid meetups are cancelled by the seller only, plus a seller "buyer took the item" report; escalated disputes with no moderator decision in 14 days refund the buyer. DPA/BIR out of scope (personal project).
- [x] Migration `20261014000100_audit_fixes.sql`: demo fast-forward only for the waiting side; buyer can't cancel a paid meetup; `dispute_report_buyer` (seller, starts escalated); buyer dispute reasons limited; `disputes.opened_by`, `decide_by` + trigger; 14-day fallback in timers; unpaid (cash/COD) orders capped at 3 per buyer and held 3 days; orders keep `description`/`condition`; triggers freeze reserved listings and restricted sellers' edits (fields and photos); admins can't decide their own dispute; one review counts per reviewer–reviewee pair
- [x] API: last tracking step buyer-only; `POST /orders/{id}/dispute/report-buyer`; `GET /listings/{id}/viewer`; edits refused while reserved/restricted; account deletion pauses live listings first (own committed transaction) and re-checks orders; new rate limits (profile, listing edits, favorites, offer answers), search 600/min; categories/locations cached in memory 1 h; PNG/WebP ≤ 16 MP and one decode at a time; handover code hidden once disputed; admin disputes show the purchase snapshot and deadline
- [x] UI: handover and code copy ("keep the item until it succeeds"), seller "Buyer took the item" form, buyer "I have the item", deadline line for escalated disputes, admin snapshot; listing page uses `/viewer`; photos shrunk in the browser (2000 px JPEG) before upload
- [x] Docs: AUDIT status table, SECURITY_PLAN T33–T38, TRANSACTIONS_DESIGN, API spec, schema, limitations, README test-mode guide; demo seed adds a 13th order (seller report) and the buyer-cancel demo uses a delivery order
- Checks passed: 11 new integration tests failed before the migration and pass after; `supabase db reset` replays all 11 migrations, demo data loads; Ruff; pytest 248/248; ESLint; typecheck; Vitest 102/102; `next build`; browser: paid meetup buyer has no Cancel/Skip, seller sees report + keep-item copy, reported order (buyer view: "I have the item", deadline, no code), listing page calls `/viewer` (200), no console errors
- Changed from plan: Next.js `'use cache'` page caching was not used (entries stay in one serverless instance and would call the API during `next build`); the API caches reference lists instead. The Next.js security release is not out yet.

### Phase 15 — Page redesign (done 2026-10-14)
Source: Claude Design export (git-ignored) from `docs/design/CLAUDE_DESIGN_BUNDLE.md`.
- [x] API: `PUT`/`DELETE /me/avatar` (checked, 400 px square WebP, own folder, old file removed after commit); `/me` returns `avatar_url`; public profiles return `sold_count`
- [x] Listing page: actions render with the page (guest defaults, swap in place); phone action bar fixed to the bottom; swipe gallery with "1 / n", Share and Save on the photo; desktop thumbnails, arrows, full-screen viewer with zoom and keyboard; description under the title on phones; seller card with rating; one-line safety note; owner Pause / Mark sold / Edit; "See similar items" when sold/reserved; "More from @seller" and "More in {category}" rows (hidden for the owner)
- [x] Seller page: "This is your public profile" bar; Follow (full width on phones) + Share + •••; stats strip (rating, items sold, followers, joined); Listings | Reviews tabs (`?tab=reviews`) with a rating summary
- [x] Own profile: public-style header with Edit / View public profile, private email note, stats, "Finish your profile" checklist, account sidebar (desktop) and shortcut rows (phones), active listings preview; edit form with photo upload/remove, @username with link hint, city picker, bio counter, desktop preview
- [x] Design system: `text-star` token (replaces a hard-coded hex in `Stars`); new shared parts listed in DESIGN_SYSTEM
- Checks passed: Ruff; pytest 253/253 (avatar upload/replace/remove/reject with real Storage, city set/clear, sold count, avatar unit test); ESLint; typecheck; Vitest 112/112 (listing actions per viewer, gallery empty state, stats, share); `next build`; browser at 1280 px and 375 px: listing (guest, owner bar, rows hidden for owner), seller page with reviews (visitor), own profile and edit (city saved and shown publicly), no sideways scroll on any of them
- Not checked by hand: picking a photo file in the browser (covered by API tests); screen reader pass on the new gallery and tabs

### Later
- Realtime chat; saved searches; notifications; returns/partial refunds; real PH payment provider (needs business registration).

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
| 2026-10-13 | 4 | Seller listings done. New deps: `python-multipart` (FastAPI needs it for uploads); `httpx2` moved from dev to main (Storage calls). |
| 2026-10-13 | 5 | Buyer–seller interactions done. Found and fixed a pre-existing DB bug: offer notes failed after a buyer deleted their account, blocking "mark sold". |
| 2026-10-13 | 6a | Reports, blocks, account deletion, rate limits, settings. No new dependencies. Local secret key added to untracked `backend/.env`. Dev server stopped for `next build`; `.next` cleared. |
| 2026-10-13 | 8 | Release checks. No new dependencies (Lighthouse and pip-audit run once, not installed). Demo data reloaded after the reset. |
| 2026-10-13 | 7 | Closets, sizes, deal options. No new dependencies. Escrow and courier APIs left out on purpose (business registration, fees, BSP rules; ₱0 rule). Local DB reset to replay migrations. |
| 2026-10-13 | 6b | Pages, a11y, CSP, review. No new dependencies (Lighthouse run once via `npx`, not installed). `/security-review` can't run without a git remote; same review done by hand. A throwaway local test account was created for checks and deleted through Settings. |
| 2026-10-13 | 9 | Transactions research (2 subagents) + design docs. No code, no dependencies. Carousell PH has no in-app payment; Vinted model simulated instead. |
| 2026-10-13 | 10 | Simulated payments core. No new dependencies (hmac/hashlib/secrets from the standard library; pgcrypto already installed). |
| 2026-10-13 | 11 | Fulfilment and reviews. No new dependencies. Found and fixed the conditional confirm dialog closing itself. |
| 2026-10-13 | 12 | Disputes and admin moderation. No new dependencies. Found and fixed 500s on `null` optional text. A local demo user (homebody_liza) has the moderator role for manual checks. |
| 2026-10-13 | 13 | Release checks and polish. No new dependencies. Lighthouse run once via `npx` on a temporary `next start` (port 3200, stopped afterwards). Demo data reloaded; `demo_moderator@demo.test` added. |
| 2026-10-14 | 14 | Audit fixes. No new dependencies. Local DB reset and demo data reloaded (new demo password, printed by the seed). Found during the phase: the handover code still showed on a disputed meetup (now hidden). |
| 2026-10-14 | 15 | Page redesign from Claude Design. No new dependencies. A local demo profile's city was changed to Cebu City during the browser check. |
