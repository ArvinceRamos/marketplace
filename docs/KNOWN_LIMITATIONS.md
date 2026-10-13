# Known Bugs and Limitations

Last updated: 2026-10-13 (Phase 13; Phase 8 list kept and updated). Collected from every phase's "Not done" notes and the Phase 8
checks. Nothing here is hidden from users that they would need to know; items marked **before
launch** should be fixed or decided before the site is shared publicly.

## 1. Before launch (decide or fix)
| # | Item | Why it matters | Suggested fix |
|---|---|---|---|
| 1 | ~~No moderation tool~~ **Built in Phase 12** (`/admin`). Still needed: someone to actually check the queue | Reports and escalated disputes wait for a person | Give one trusted account the role (`npm run db:admin` locally; SQL on the hosted project) and check `/admin` daily |
| 7 | **Checkout is test mode only.** MockPay and MockCourier are simulated | Real money needs a licensed PH payment partner (business registration, fees, BSP rules); the ₱0 rule | Keep the "Test mode" labels; a real provider would be a second class behind `app/integrations/` plus its webhook secret |
| 2 | **No contact address** on `/privacy` for privacy requests and data copies | RA 10173 rights (access, copy, objection) need a way to ask | Add a contact email you control |
| 3 | **Next.js 16.4.0** is pinned; a security release was announced for 2026-10-14 | Known framework issues stay open until upgraded | Upgrade to the patched 16.4.x when out; rerun all checks |
| 4 | **Not deployed and CI never ran on GitHub** (no repository yet) | Hosted settings are untested: pooler connection, `api_app` password, CORS origin, CSP origins, `TRUSTED_PROXY_HOPS=1` on Render | Follow the deployment plan after "Deploy now."; first run CI on a private repo |
| 5 | **Google sign-in not configured**; hosted email confirmation planned off (decision A) | Fake emails possible; password reset limited to 2 emails/hour | Decide on custom SMTP or Google sign-in before inviting many people |
| 6 | **Free-tier ceilings** (FREE_TIER_LIMITATIONS): 1 GB photos, 5 GB Supabase egress, 5 GB Render bandwidth, sleeping API, no backups | The site can stop or lose data with no warning to users | Keep it a small, non-commercial group; manual `supabase db dump` before risky changes |

## 2. Known limits (accepted for now)
- **Rate limits live in memory**: they reset when the API restarts or sleeps (single Render
  instance). Supabase Auth has its own limits for sign-up and login.
- **API cold start**: the first visit after 15 idle minutes waits about a minute; pages show a
  skeleton, then "We couldn't load this page" with Try again after 20 s.
- **Chat is polling, not realtime**: the open chat checks every ~10 s, the inbox and unread badge
  every ~30 s. After blocking someone, the header badge updates on its next poll, not at once.
- **No notifications** (email or push) for new messages or offers.
- **A deleted user's token works up to 1 hour** after deletion; RLS still blocks their data
  because the profile is gone.
- **Account deletion edge case**: if Auth fails after photos were removed, the account remains
  without photos; trying again finishes the job.
- **CSP keeps `'unsafe-inline'` scripts** (static pages need it); React escaping is the main XSS
  defence (SECURITY_PLAN §7).
- **Not-found pages return HTTP 200** with `noindex` (they stream).
- **Search** uses Postgres `simple` text search plus partial title match: no Filipino/English
  stemming or typo tolerance.
- **No self-service data export** (copy of your data); only view, edit, and delete.
- **Payments and couriers on listings are labels only**; the Buy button's checkout is a
  **simulation** (Phases 10–12): no real payment, payout, waybill, or courier.
- **Sizes**: fixed lists (clothing letter sizes, EU shoe sizes, kids' ages); no "my sizes"
  preference; the size filter shows only on a subcategory, not on "All Fashion".
- **Following feed** shows the 48 newest items, no paging.
- **Photos are not shrunk in the browser** before upload (more mobile data on big photos).
- **No favorite counts** on cards.

## 3. Quality notes
- **Lighthouse performance** 71–93 on a throttled mobile profile (mostly script blocking time);
  accessibility 100 and best practices 100 on every page audited (Phases 6b and 7).
- **`<summary>`-based menus** (Account, "•••") pass Lighthouse but were not tried with a real
  screen reader.
- **Pages stay mounted when hidden** (Next.js Cache Components): the DOM holds a hidden copy of
  recently visited pages. Account pages clear their data when hidden; keep doing this for new ones.
- **Dev-only npm audit findings**: 5 high in `braces` via the ESLint tooling; production
  dependencies have 0. Python dependencies: no known vulnerabilities (pip-audit, 2026-10-13).
- **supabase-js warns that Node 20 is deprecated**; move local and CI to Node 22.
- **Vitest on this PC** can time out starting workers when the machine is busy; use
  `npx vitest run --maxWorkers=2`.
- **Demo photos** are generated shapes (a shirt for every Fashion item, including shoes).

## 4. Test-mode checkout (Phases 10–12)
- **Timers are lazy**: unpaid orders (30 min), ship-by (5 days), meet-by (7 days), auto-complete
  (2 days after delivery), and the seller's 48 hours on a dispute apply when someone opens the
  order, the order lists, the wallet, the listing, or the moderator queue. Nothing runs in the
  background, so an abandoned order can stay "open" in the database until then.
- **Reserved listings are hidden from search** (only `active` items show); the listing page shows
  "Reserved".
- **No returns, partial refunds, or counter-offers in disputes**: a refund is the full total and the
  buyer keeps the item (the listing is marked sold; the seller can "Undo sold").
- **One item per order**; no bundles, no shipping address (couriers are simulated), no delivery
  fee by distance (demo flat rates).
- **Cash and COD orders have no buyer protection** (no dispute), like the real thing.
- **Restricted users can't message**, even in chats about their open orders; they can still finish
  orders (ship, hand over, confirm, review).
- **The admin role reaches the token on the next sign-in** (or token refresh, up to 1 hour).
- **Unhandled server errors (500) have no CORS headers**, so the browser shows "Can't reach the
  server" instead of the generic message (SECURITY_PLAN §3c). Found during Phase 12 testing.
- **Test runs leave anonymized orders** in the local database (their users are deleted, so the
  orders keep `null` buyer/seller). `npm run db:reset` clears them.
- **The audit log keeps entries** after the moderator deletes their account (admin shown as
  "Deleted user").
