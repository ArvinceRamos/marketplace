# Known Bugs and Limitations

Last updated: 2026-10-13 (Phase 8). Collected from every phase's "Not done" notes and the Phase 8
checks. Nothing here is hidden from users that they would need to know; items marked **before
launch** should be fixed or decided before the site is shared publicly.

## 1. Before launch (decide or fix)
| # | Item | Why it matters | Suggested fix |
|---|---|---|---|
| 1 | **No moderation tool.** Reports are stored, but nobody can act on them inside the app | Prohibited items and scammers stay up until someone edits the database by hand | Build the planned admin role (`app_metadata.role = admin`) and a small reports queue; until then, check `app.reports` weekly with SQL |
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
- **Payments and couriers are labels only**: no escrow, payment links, or waybills (by design:
  business registration, fees, and BSP rules; see Phase 7 notes).
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
