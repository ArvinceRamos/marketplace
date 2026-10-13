# Security Plan

Last updated: 2026-10-10 · Status: Phase 0 design

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
| T11 | Spam / abuse (mass chats, reports) | Per-user rate limits (API spec §3); Supabase Auth limits; one open report per target | 21st new chat in an hour → 429 |
| T12 | XSS via listing text or chat | React escapes by default; no `dangerouslySetInnerHTML`; plain text only; strict CSP headers in Next.js | Script tags render as text |
| T13 | SQL injection | SQLAlchemy bound parameters only; `websearch_to_tsquery` for search input | Quotes and SQL in `q` → normal results |
| T14 | Open redirect after login | `next` must be a relative same-site path | `?next=https://evil.example` → goes to `/` |
| T15 | User enumeration / ID probing | 404 for not-visible; generic auth errors from Supabase | Draft listing ID by stranger → 404 |
| T16 | Secret leaks | `.env*` git-ignored; `.env.example` placeholders; CI uses local CLI keys only; secret scanning on GitHub; never log tokens | `git grep` for key patterns in CI (simple check) |
| T17 | CSRF | API uses bearer tokens in headers, not cookies, so cross-site forms cannot call it; CORS restricted | — |
| T18 | Scams between users | Safety page, chat banner, "payments happen outside the app", report + block, no fake "verified" labels | Manual review of copy |
| T19 | Dependency vulnerabilities | Lockfiles (`uv.lock`, `package-lock.json`); Dependabot alerts (free); pin patched Next.js (security release due 2026-10-14) | CI installs from lockfiles |
| T20 | Error leaks | Central handler returns generic 500; details only in logs with request ID; OpenAPI docs off in production | Forced error → no stack trace in response |

## 3. Keys and secrets
| Key | Where it may live | Notes |
|---|---|---|
| Publishable key (`sb_publishable_…`) | Frontend env, browser | Public by design. Only reaches Auth and public Storage reads |
| Secret key (`sb_secret_…`) | Backend env only | **Only use:** delete an Auth user during account deletion. Never in frontend, CI, or logs |
| `DATABASE_URL` for `api_app` | Backend env only | Role without BYPASSRLS |
| Local CLI keys | Local `.env`, CI | Printed by `supabase start`; only valid for the local stack |

## 4. Account deletion (PH Data Privacy Act)
1. User types their username to confirm.
2. API deletes their Storage objects (with the user's own token).
3. API calls the Auth admin "delete user" endpoint with the secret key (the one RLS bypass, logged).
4. Database cascades remove profile, listings, images, favorites, blocks, own reports.
   Conversations keep the other person's messages; the deleted user's side shows "Deleted user".

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

Also planned: an 18+ checkbox at sign-up, a prohibited-items list on `/safety` and `/terms`,
and a counterfeit/IP report reason.

## 6. Security checks per phase
- Phase 2: RLS tests for every table and action (allowed + denied).
- Phase 4: upload attack tests (T6–T8).
- Phase 5: participant, offer, and block tests (T3–T5).
- Phase 6: run `/security-review` on the branch; fix findings; review headers/CSP.
- Phase 7: full test suite, dependency audit (`npm audit`, `uv` lock review), secrets scan.
