# Security Plan

Last updated: 2026-10-13 · Status: Phase 8 — release checks done (not deployed)

## 1. Principles
1. **Server decides.** Identity comes from a verified token. Ownership, roles, and states are checked on the server.
2. **Two walls.** FastAPI checks rules; Postgres RLS enforces them again.
3. **Least privilege.** API runs SQL as `anon`/`authenticated`, not as a bypass role. The secret key has one documented use.
4. **Nothing private by default.** Responses include only fields the caller needs.
5. **Test the "no" paths.** Every protected action has a test that a stranger gets 401/403/404.

## 2. Threats and controls
| # | Threat | Control | Test |
|---|---|---|---|
| T1 | Forged or expired token | Verify ES256 signature against JWKS, `iss`, `aud`, `exp`; reject `alg: none`/HS256 when asymmetric expected | Bad signature, wrong issuer, expired → 401 |
| T2 | Acting as another user by sending their ID | User ID only from token `sub`; bodies have no owner fields; RLS `WITH CHECK` | PATCH someone else's listing → 404; body with `seller_id` → 422 |
| T3 | Reading other people's chats | RLS on conversations/messages; API participant check | Non-participant GET thread/messages → 404 |
| T4 | Offer state abuse (buyer accepts own offer, accept twice) | Role + state checks in service; DB trigger rejects illegal transitions; row lock (`SELECT … FOR UPDATE`) | Each illegal transition → 403/409; concurrent accept → one wins |
| T5 | Messaging yourself / blocked users | Check constraint buyer ≠ seller; block check in API + RLS | Own listing chat → 409; blocked → 403 |
| T6 | Malicious uploads (scripts renamed `.jpg`, huge files, decompression bombs) | Size cap before reading fully; Pillow opens and verifies; `Image.MAX_IMAGE_PIXELS` limit; re-encode to WebP; bucket allows only `image/webp` ≤ 2 MB; random file names | Fake JPEG, 20 MB file, 9th image, PNG bomb → rejected |
| T7 | Location leak via photo EXIF/GPS | Re-encoding drops all metadata | Upload with GPS EXIF → stored file has none |
| T8 | Writing into someone else's storage folder | Storage policy: first path folder must equal `auth.uid()`; API builds paths, never the client | Upload with other user's token path → denied |
| T9 | Direct database access from browser | App tables in non-exposed `app` schema; RLS still on; secret key never in frontend | Call Supabase Data API for `app` tables → not found |
| T10 | Privilege escalation to admin | Admin only via `app_metadata.role` (users cannot edit it); no client-side role flags; admin routes not built yet | User edits `user_metadata.role` → still not admin |
| T11 | Spam / abuse (mass chats, reports) | Per-user rate limits (API spec §3); Supabase Auth limits; one open report per target | 11th report in a day → 429 + `Retry-After`; limiter unit tests (every action uses the same code) |
| T12 | XSS via listing text or chat | React escapes by default; no `dangerouslySetInnerHTML`; plain text only; static CSP in Next.js (§7) | Script tags render as text; outside scripts and fetches blocked by CSP (browser check) |
| T13 | SQL injection | SQLAlchemy bound parameters only; `websearch_to_tsquery` for search input | Quotes and SQL in `q` → normal results |
| T14 | Open redirect after login | `next` must be a relative same-site path | `?next=https://evil.example` → goes to `/` |
| T15 | User enumeration / ID probing | 404 for not-visible; generic auth errors from Supabase | Draft listing ID by stranger → 404 |
| T16 | Secret leaks | `.env*` git-ignored; `.env.example` placeholders; CI uses local CLI keys only; secret scanning on GitHub; never log tokens | CI job `secrets` greps tracked files for Supabase secret keys, PEM/JWK private keys, and full JWTs (Phase 8); history scanned once (2026-10-13, clean) |
| T17 | CSRF | API uses bearer tokens in headers, not cookies, so cross-site forms cannot call it; CORS restricted | — |
| T18 | Scams between users | Safety page, chat banner, "payments happen outside the app", report + block, no fake "verified" labels | Manual review of copy |
| T19 | Dependency vulnerabilities | Lockfiles (`uv.lock`, `package-lock.json`); Dependabot alerts (free); pin patched Next.js (security release due 2026-10-14) | CI installs from lockfiles |
| T21 | Follow graph leaks (who follows whom) or follow spam | RLS: only your own follows are readable; public count via a definer function; follow rate limit 60/hour, max 1,000; no follows across a block; blocking ends follows both ways | Others/guests can't read follows; insert as someone else → 42501; block removes both directions |
| T22 | Payment scams via in-app "payment" features | No payments, escrow, or courier booking in the app; payment methods and couriers are labels only; safety copy next to them ("never share a one-time PIN") | Manual review of copy |
| T20 | Error leaks | Central handler returns generic 500; details only in logs with request ID; OpenAPI docs off in production | Forced error → no stack trace in response |

## 3. Keys and secrets
| Key | Where it may live | Notes |
|---|---|---|
| Publishable key (`sb_publishable_…`) | Frontend env, browser | Public by design. Only reaches Auth and public Storage reads |
| Secret key (`sb_secret_…`) | Backend env only | **Only use:** delete an Auth user during account deletion (`app/services/auth_admin.py`, the only file that reads it; stored as `SecretStr`). Never in frontend, CI, or logs. Missing → `DELETE /me` is 503 and nothing is removed |
| `DATABASE_URL` for `api_app` | Backend env only | Role without BYPASSRLS |
| Local CLI keys | Local `.env`, CI | Printed by `supabase start`; only valid for the local stack |

## 3b. Phase 2 notes (implemented and tested)
- **18+ rule is enforced in the database.** The `auth.users` insert trigger rejects email sign-ups
  without `age_confirmed: true` in the sign-up metadata. The frontend checkbox is only the UI for it.
  OAuth sign-ups (Google, later) will need a first-login confirmation step instead.
- **Local-only credentials.** `api_app_local_dev_only` (in `seed.sql`) and the CLI demo keys only
  work on the local stack. Hosted projects get a separate strong `api_app` password, set by hand.
- **Signing key file.** `supabase/signing_keys.json` contains a private key and is git-ignored.
- **Deleted users.** An access token stays valid until it expires (max 1 hour) after an account is
  deleted. RLS still protects data: the profile is gone, so `/me` returns 404 and ownership checks fail.
- **Guard triggers.** Triggers that tell end users apart from internal updates run with caller
  rights on purpose; inside `security definer` functions `current_user` is always the owner.
- **Bad tokens are rejected, not ignored**, even on public routes, so a broken session is visible.

## 3c. Security headers (Phase 6b)
Set for every page in `frontend/next.config.ts` from `src/lib/security-headers.ts` (unit tested).
See §7 for the CSP.
| Header | Value | Why |
|---|---|---|
| `X-Frame-Options` + CSP `frame-ancestors 'none'` | DENY | No clickjacking |
| `X-Content-Type-Options` | nosniff | No MIME sniffing |
| `Referrer-Policy` | strict-origin-when-cross-origin | Listing and chat URLs don't leak to other sites |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb, topics off | Features we don't use |
| `Cross-Origin-Opener-Policy` | same-origin | Other windows can't script ours |
| `Strict-Transport-Security` | 2 years, subdomains (no preload) | HTTPS only once hosted; ignored on http |
| `X-Powered-By` | removed | Less fingerprinting |

API (FastAPI, `app/main.py`, Phase 8, tested): every response gets `nosniff`, `X-Frame-Options:
DENY`, `Referrer-Policy: no-referrer`, HSTS, and `Content-Security-Policy: default-src 'none';
frame-ancestors 'none'` (JSON only; skipped for the local `/docs` page). Requests with an
`Authorization` header get `Cache-Control: no-store`. Not covered: 413 from the body-size limit and
unhandled 500s (both outside that middleware; JSON bodies only).

## 4. Account deletion (PH Data Privacy Act)
1. User types their username to confirm.
2. API deletes their Storage objects (with the user's own token). **Required:** Auth deletes a
   user even when they still own files, and the files then stay behind (checked locally 2026-10-13).
3. API calls the Auth admin "delete user" endpoint with the secret key (the one RLS bypass, logged).
4. Database cascades remove profile, listings (with chats and offers about them), images,
   favorites, blocks, and own reports. Chats where they were the buyer stay for the seller,
   showing "Deleted user". Verified by an integration test.

**Why the secret key is allowed here (the one documented RLS bypass).** Deleting an Auth user is
an Auth admin action; no user token can do it. Limits: the user ID comes only from the verified
token; the user must type their username; the key is sent only to `<SUPABASE_URL>/auth/v1/admin`;
each use writes one log line with the user ID and request ID (no email or name). Built and tested
in Phase 6a (`test_api_safety.py`): wrong confirmation removes nothing; a missing key removes
nothing (503); a Storage failure stops before the Auth call (502). If the Auth call fails after the
files were removed, the account stays without photos and a retry finishes the job (404 from Auth
counts as done).

## 5. Privacy and legal notes (not legal advice)
The Philippine **Data Privacy Act of 2012 (RA 10173)** applies to personal data of people in the PH.
Relevant points for this project:
- Sec. 11 — collect only what is needed, for declared purposes (transparency, legitimate purpose, proportionality).
- Sec. 16 — users have the right to be informed, to access, correct, and erase their data.
- Sec. 20 — reasonable organizational, physical, and technical security measures.

What we do: a plain-language privacy notice at `/privacy` before sign-up; collect only email,
username, optional name/avatar/city; city-level location only; profile editing (correction);
account deletion (erasure); EXIF stripping; no sale or sharing of data.
Source: https://privacy.gov.ph/data-privacy-act/ (checked 2026-10-10). Before any public launch,
read the full law and NPC guidance or ask a qualified person.

Done: 18+ checkbox at sign-up (Phase 2); counterfeit report reason (6a); `/privacy`, `/terms`, and
`/safety` with the prohibited-items list (6b), linked from the footer and the sign-up form.
Open before public launch: a contact address for privacy requests on `/privacy` (and for data
copies, which have no self-service export yet).

## 6. Security checks per phase
- Phase 2: RLS tests for every table and action (allowed + denied).
- Phase 4: upload attack tests (T6–T8). Done 2026-10-13: renamed scripts, truncated JPEG, GIF,
  60-megapixel PNG bomb, 9 MB file, oversized and chunked bodies, 9th photo, GPS EXIF gone from
  stored files, strangers get 404 on every seller action. Rate limits (T11) are **not built yet**.
- Phase 5: participant, offer, and block tests (T3–T5). Done 2026-10-13: strangers get 404 on
  every chat and offer route; sender cannot be spoofed (422); buyer cannot accept, seller cannot
  offer or withdraw; answered/expired offers are 409; blocked users cannot start chats, message, or
  offer. Also: login and register forms now clear after success, so a typed password is not kept
  in the hidden page after logging out on a shared device.
- Phase 6a (2026-10-13): reports, blocks, account deletion, rate limits (T5, T11). Tests: reports
  (duplicate 409, self/own listing 422, hidden listing 404, no `reporter_id` in bodies, private
  to the reporter); blocks (self 422, idempotent, chat hidden from blocker's inbox and badge,
  blocked person can't write and isn't told why, unblock restores); deletion (files then Auth
  user, wrong name, no key); 11th report in a day → 429 with `Retry-After`. Rate limiter unit
  tests cover windows, costs, and the `X-Forwarded-For` rule (only the hop our proxy added is
  trusted; `TRUSTED_PROXY_HOPS`, default 0). Known limit: counts reset on restart. Also: the
  `/settings` page drops account data when hidden, like the login forms.
- Phase 6b (2026-10-13): security headers and CSP (§7); safety, privacy, and terms pages (T18).
  Security review of everything since Phase 5 (`8e6ee9e`, i.e. 6a + 6b). The `/security-review`
  command needs a git remote (`origin/HEAD`), which this repo does not have yet, so the same review
  was done by hand on `git diff 8e6ee9e`. Checked: caller ID only from the token in every new route;
  SQL uses bound parameters (f-strings join fixed fragments only); report/block/delete routes need a
  token and are rate limited (delete needs the typed username); the secret key goes only to
  `/auth/v1/admin` and is never logged; Storage cleanup uses the user's own token, so RLS limits it to
  their folder; no `dangerouslySetInnerHTML` or `eval` in the frontend; account data is dropped
  from hidden pages (`/profile`, `/profile/edit`, `/settings`). **No vulnerabilities found.**
  Accepted, documented trade-offs: `script-src 'unsafe-inline'` (§7); a blocked person can guess
  they were blocked because they can no longer write (by design, T5); rate limits reset on restart.
  The API's own headers were added in Phase 8 (§3c).
- Phase 7 (2026-10-13): follows, sizes, deal options (T21, T22). Tests: follow/unfollow idempotent,
  self 422, unknown 404, guests 401; follows private under RLS (other users and guests see none;
  insert as someone else and setting `created_at` refused); blocking ends follows both ways and
  re-follow across a block is 403 with no reason; feed shows only followed sellers' active
  listings; sizes outside the category's list and impossible deal options are refused by the API
  (422 with field) and again by the database (23514).
- Phase 8 (2026-10-13): migrations replayed from scratch; full suites; `npm audit` (production 0;
  5 high dev-only in `braces` via ESLint tooling), `pip-audit` on the locked backend
  requirements (0 known); secrets grep of tracked files and full git history (clean); CI gains a
  `secrets` job; API security headers. Remaining items: docs/KNOWN_LIMITATIONS.md.

## 7. Content Security Policy (Phase 6b)
Static policy in a header, no nonces (decision 2026-10-13): nonces force every page to render
per request and drop the prerendered shells (Next.js CSP guide, `node_modules/next/dist/docs`).

`default-src 'self'` · `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` in dev only) ·
`style-src 'self' 'unsafe-inline'` · `img-src 'self' blob: data: <Supabase>` · `font-src 'self'` ·
`connect-src 'self' <Supabase> <API>` · `object-src 'none'` · `base-uri 'self'` ·
`form-action 'self'` · `frame-ancestors 'none'` · `upgrade-insecure-requests` (only when both
URLs are https).

Origins come from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_API_BASE_URL` at build/start time;
a missing or broken URL is left out (stricter), never replaced by `*`. **Trade-off:** Next.js
static shells need inline scripts, so `'unsafe-inline'` stays and the CSP is a second line of
defence; the first is React escaping (T12). It still blocks scripts and data calls to any other
origin, plugins, `<base>` hijacking, and framing. Checked in the browser (2026-10-13): sign-up,
profile edit, listing photos, chat, account deletion, and dev hot reload work; a fetch and a
`<script>` to another origin are blocked. Re-check after deploy: hosted Supabase and API URLs
must be the ones in the frontend env, or images and sign-in break.
