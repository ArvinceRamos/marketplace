# API Specification

Last updated: 2026-10-13 · Status: built through Phase 8; orders, payments, admin designed in Phase 9. FastAPI also serves live OpenAPI docs at
`/docs` (local and non-production only).

Base path: `/api/v1`. JSON in and out, except image upload (multipart).
Auth: `Authorization: Bearer <Supabase access token>`. 🔓 = public, 🔒 = token required.

## 1. Conventions

**Errors** (one shape everywhere):
```json
{ "error": { "code": "offer_not_pending", "message": "This offer was already answered.", "fields": null } }
```
| Status | When |
|---|---|
| 400 | Malformed request |
| 401 | Missing, expired, or invalid token (`code: not_authenticated`) |
| 403 | Signed in but action not allowed on a resource you can see (e.g. buyer tries to accept own offer) |
| 404 | Not found **or not visible to you** (we do not reveal existence) |
| 409 | Conflict with current state (listing not active, pending offer exists, duplicate report) |
| 413 | Upload too large |
| 422 | Validation failed (`fields` maps field → message) |
| 429 | Rate limited (`Retry-After` header) |
| 500 | Unexpected; message is generic, details only in server logs with a request ID |

**Pagination**
- Lists: `?page=1&page_size=24` (max 48, page ≤ 50) →
  `{ "items": [...], "page": 1, "page_size": 24, "total": 312, "has_next": true }`
- Messages: `?before=<message_id>&limit=30` → `{ "items": [...], "next_before": 1234 | null }`

**Money:** `price_centavos` integers in requests and responses. The frontend formats `₱1,500`.
**Time:** ISO 8601 UTC. **IDs:** UUID strings (message IDs are integers).
**Unknown fields** in bodies are rejected (422).

## 2. Endpoints

### Health and identity
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | 🔓 | `{status:"ok"}`; does not touch DB (used by Docker/Render health checks) |
| GET | `/health/ready` | 🔓 | checks DB; returns 503 if down |
| GET | `/me` | 🔒 | own profile + email (only place email is returned) |
| PATCH | `/me` | 🔒 | `display_name, username, bio, city_id`; 409 if username taken |
| PUT | `/me/avatar` | 🔒 | multipart `file`; same checks as listing images; 1 file |
| DELETE | `/me` | 🔒 | body `{confirm_username}`; deletes account (§SECURITY_PLAN account deletion) |

### Public reference data
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/categories` | 🔓 | tree; cacheable. Each subcategory has `sizes` (its size list in display order; `[]` = no sizes) |
| GET | `/locations` | 🔓 | regions → cities; cacheable |
| GET | `/profiles/{username}` | 🔓 | public fields only: username, display_name, avatar_url, city, bio, joined_at, active_listing_count, follower_count |
| GET | `/profiles/{username}/listings` | 🔓 | active listings, paginated |

### Listings
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/listings` | 🔓 | search; see query params below |
| GET | `/listings/{id}` | 🔓 | detail; owner also sees own draft. Includes `is_favorited`, `is_owner`, `my_conversation_id` when signed in |
| POST | `/listings` | 🔒 | create draft |
| PATCH | `/listings/{id}` | 🔒 owner | edit fields (not status) |
| POST | `/listings/{id}/status` | 🔒 owner | `{status: active|paused|sold}`; transitions per USER_FLOWS §3; publish requires ≥1 image |
| DELETE | `/listings/{id}` | 🔒 owner | soft delete; 204; photos removed from Storage after commit |
| GET | `/me/listings?status=active` | 🔒 | own listings by status (`draft`, `active`, `paused`, `sold`), newest change first, paginated |

Seller rules (Phase 4): another user's listing, or a deleted one, is 404 for every seller action.
Create/edit bodies reject unknown fields (`seller_id`, `status`, …) with 422. A parent category or
unknown city is 422 with a field message. Status errors: 409 `invalid_status_change`, 409
`listing_needs_photo`. Repeating the current status is a no-op (200).

`GET /listings` query:
| Param | Type | Rule |
|---|---|---|
| `q` | string | 0–100 chars, trimmed |
| `category` | slug | parent slug includes its children |
| `min_price`, `max_price` | int (pesos) | 0–100,000,000; min ≤ max |
| `condition` | repeatable enum | e.g. `condition=like_new&condition=brand_new` |
| `city` | slug | |
| `size` | repeatable string | ≤ 20 chars each, ≤ 15 values; exact match, any of them (Phase 7) |
| `payment` | repeatable enum | `gcash`, `maya`, `bank_transfer`, `cash`, `cod`; listings accepting any of them |
| `courier` | repeatable enum | `jnt`, `flash`, `lbc`, `lalamove`, `grab`; any of them |
| `sort` | enum | `newest` (default), `price_asc`, `price_desc`, `relevance` (only with `q`) |
| `page`, `page_size` | int | see conventions |

Create/edit body:
```json
{
  "title": "iPhone 13 128GB Midnight",
  "description": "Battery health 88%. Complete box. Meetup only.",
  "price_centavos": 2350000,
  "category_id": 12,
  "condition": "lightly_used",
  "city_id": 41,
  "meetup": true,
  "delivery": false,
  "deal_note": "SM North EDSA, weekends",
  "size": null,
  "payment_methods": ["gcash", "cash"],
  "couriers": []
}
```
Phase 7 fields (all optional): `size` must be on the category's size list (422 `size`: "Pick a
size from the list." or "This category has no sizes."; on edit, changing to a category without
sizes needs `size: null`). `payment_methods` and `couriers` are lists (duplicates dropped, ≤ 5).
COD and couriers need `delivery`; `cash` needs `meetup` (422 with the field named). Labels only:
the app never takes payments or books couriers.
Listing response (card): `id, title, price_centavos, condition, status, city {name}, cover_thumb_url, seller {username, display_name, avatar_url}, published_at, size`.
Detail adds: `description, category {id, slug, name}, parent_category, images[{id, full_url, thumb_url, width, height, position}], meetup, delivery, deal_note, payment_methods, couriers, created_at, updated_at, is_owner`.
Search `q` matches title and description words, partial titles, and category names.

### Listing images
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/listings/{id}/images` | 🔒 owner | multipart field `files` (1–8); total ≤ 8 (409 `too_many_photos`); each ≤ 8 MB (413 `file_too_large`); JPEG/PNG/WebP by content (422 `unsupported_image` / `invalid_image` / `image_too_large`); one bad file stores nothing. Returns the listing detail |
| PATCH | `/listings/{id}/images/order` | 🔒 owner | `{image_ids: [...]}` every photo exactly once (422 `image_order_mismatch`); first = cover. Returns detail |
| DELETE | `/listings/{id}/images/{image_id}` | 🔒 owner | 409 `last_photo` for the last photo of an active listing; positions are repacked. Returns detail |

Body size limits: JSON 64 KB, multipart 64.25 MB. A larger `Content-Length` gets 413
`payload_too_large` before the body is read; a chunked body that goes over is cut off (400).

### Favorites
| Method | Path | Auth | Notes |
|---|---|---|---|
| PUT | `/listings/{id}/favorite` | 🔒 | idempotent; 409 if own listing |
| DELETE | `/listings/{id}/favorite` | 🔒 | idempotent; 204 |
| GET | `/me/favorites` | 🔒 | paginated; sold and paused items keep their status; deleted listings drop out (no longer visible under RLS) |
| GET | `/me/favorite-ids` | 🔒 | newest 1,000 saved listing IDs, for the hearts on cards |

### Conversations and messages
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/listings/{id}/conversations` | 🔒 | get-or-create as buyer; 409 if own listing or not active; 403 if blocked either way |
| GET | `/conversations` | 🔒 | inbox: `id, listing{id,title,thumb,status}, other_user, last_message{preview,at}, unread_count`; `?role=buying|selling` |
| GET | `/conversations/{id}` | 🔒 participant | header info + listing state + latest offer |
| GET | `/conversations/{id}/messages` | 🔒 participant | oldest first; `?before=<id>` older page (`next_before`), `?after=<id>` only newer (polling); `limit` ≤ 50. Offer messages embed the offer |
| POST | `/conversations/{id}/messages` | 🔒 participant | `{body}` 1–2,000 chars; 403 if blocked |
| POST | `/conversations/{id}/read` | 🔒 participant | sets my `last_read_at` |
| GET | `/me/unread-count` | 🔒 | total unread for the nav badge (cheap; polled) |

Phase 5 notes: a chat the buyer opened but never wrote in is not shown to the seller. Unread =
messages from the other side newer than my read marker. `GET /conversations/{id}` adds
`latest_offer`, `can_message` (false once the other person deleted their account), and
`can_offer`. Codes: 409 `own_listing`, 409 `listing_unavailable`, 403 `blocked`, 409 `user_left`.
The listing detail adds `is_favorited` and `my_conversation_id` for a signed-in viewer.

### Offers
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/conversations/{id}/offers` | 🔒 participant | history, newest first |
| POST | `/conversations/{id}/offers` | 🔒 buyer | `{amount_centavos}`; 409 if pending exists or listing not active |
| POST | `/offers/{id}/accept` | 🔒 seller | pending → accepted |
| POST | `/offers/{id}/reject` | 🔒 seller | pending → rejected |
| POST | `/offers/{id}/withdraw` | 🔒 buyer | pending → withdrawn |
Each transition also writes an `offer`/`system` message in the same DB transaction.
Codes: 403 `not_buyer` (seller tries to offer), 403 `not_allowed` (wrong side), 409
`offer_pending`, 409 `offer_not_pending`, 409 `offer_expired`. Week-old offers are marked
expired lazily by `app.expire_stale_offers` before any offer read or change.

### Reports and blocks
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/reports` | 🔒 | `{target_type, listing_id?, username?, reason, details?}` → 201 report; 409 `already_reported` if an open one exists; 422 `cannot_report_self` (yourself or your own listing); 404 if the listing isn't visible or the user doesn't exist |
| GET | `/me/reports` | 🔒 | own reports, newest first: `id, target_type, listing{id,title}?, user{username,…}?, reason, details, status, created_at` (target null once deleted) |
| GET | `/me/blocks` | 🔒 | blocked users: `username, display_name, avatar_url, blocked_at` |
| PUT | `/users/{username}/block` | 🔒 | 204, idempotent; 422 `cannot_block_self`; 404 `user_not_found` |
| DELETE | `/users/{username}/block` | 🔒 | 204, idempotent |

Phase 6a notes: users are named by **username**, not ID. Public responses never expose user IDs
(ARCHITECTURE §8), so the server looks the ID up. `target_type: listing` needs `listing_id` and no
`username`, and the reverse for `user` (422 otherwise). Reasons: `prohibited_item`, `scam`,
`counterfeit`, `offensive`, `spam`, `other`. `details` ≤ 1,000 chars. Blocking hides the chat from
the blocker's inbox and unread count. `GET /conversations/{id}` adds `blocked_by_me`, and
`can_message`/`can_offer` are false when either side blocked. The blocked person is never told
they were blocked.

### Follows (Phase 7)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/users/{username}/follow` | 🔒 | `{following: bool}` |
| PUT | `/users/{username}/follow` | 🔒 | 204, idempotent; 422 `cannot_follow_self`; 404 `user_not_found`; 403 `follow_not_allowed` across a block (either side; the reason is not shown); 409 `too_many_follows` (1,000) |
| DELETE | `/users/{username}/follow` | 🔒 | 204, idempotent |
| GET | `/me/following` | 🔒 | sellers you follow: `username, display_name, avatar_url, followed_at`, newest first |
| GET | `/me/feed` | 🔒 | active listings from sellers you follow, newest first; `ListingPage` |

Who follows whom is private (only your own list); follower counts are public. Blocking someone
ends follows both ways.

### Account
`DELETE /me` body `{confirm_username}` (case and a leading `@` ignored) → 204. Errors: 422
`username_mismatch`; 502 `storage_unavailable` (photos could not be removed, so the account was
kept); 503 `account_deletion_unavailable` (no secret key configured, or Auth refused). Order:
Storage files under `<uid>/` in `listing-images` and `avatars` (with the user's own token), then the
Auth user (secret key). The token stays valid until it expires, but `/me` then returns 404.

### Orders and payments (Phases 10–12, test mode)
Design: `TRANSACTIONS_DESIGN.md`. Bodies never carry amounts; the database computes them.
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/listings/{id}/checkout` | 🔒 | `?offer_id=`; allowed fulfilments, payment methods, couriers, shipping fees, item price (accepted offer if given) |
| POST | `/orders/quote` | 🔒 | `{listing_id, offer_id?, fulfilment, payment_method, courier?}` → amounts; nothing saved |
| POST | `/orders` | 🔒 | same body → 201 order; listing becomes `reserved`. 409 `listing_unavailable`, `own_listing`, `option_unavailable`, `offer_not_usable`; 403 `blocked`, `restricted` |
| GET | `/orders` | 🔒 | `?role=buying|selling&state=open|done`, paginated |
| GET | `/orders/{id}` | 🔒 participant/admin | detail: amounts, status, deadlines, shipment + events, dispute, reviews, `handover_code` (buyer only), `actions` (what the caller may do now) |
| POST | `/orders/{id}/pay` | 🔒 buyer | `pending_payment` → `{checkout_url}` (MockPay) |
| POST | `/orders/{id}/cancel` | 🔒 | buyer: `pending_payment`/`confirmed`; seller: `confirmed`; refunds if paid |
| POST | `/orders/{id}/ship` | 🔒 seller | delivery, `confirmed` → `shipped` + fake waybill (Phase 11) |
| POST | `/orders/{id}/confirm-received` | 🔒 buyer | `shipped`/`delivered` → `completed` (Phase 11) |
| POST | `/orders/{id}/handover` | 🔒 seller | `{code}` meetup, `confirmed` → `completed`; 422 `wrong_code`; 409 `code_locked` after 5 wrong tries (Phase 11) |
| POST | `/orders/{id}/handover-code` | 🔒 buyer | new code, resets tries (Phase 11) |
| POST | `/orders/{id}/review` | 🔒 participant | `{rating 1–5, comment?}`; completed, within 30 days, once (Phase 11) |
| POST | `/orders/{id}/dispute` | 🔒 buyer | `{reason, details?}` (Phase 12) |
| POST | `/orders/{id}/dispute/refund` · `/contest` | 🔒 seller | open dispute (Phase 12) |
| POST | `/orders/{id}/dispute/withdraw` · `/escalate` | 🔒 buyer (escalate: either side) | (Phase 12) |
| GET | `/profiles/{username}/reviews` | 🔓 | `{average, count, items}` public reviews only (Phase 11) |
| GET | `/me/wallet` | 🔒 | `{available_centavos, pending_centavos, entries}` |
| POST | `/me/wallet/withdrawals` | 🔒 | `{amount_centavos}` ≥ ₱100 and ≤ available; to "Demo bank" |

Webhooks and test-mode tools (public routes have no user; they verify a signature instead):
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/payments/webhooks/mock` | signature | `MockPay-Signature: t=…,v1=…` HMAC-SHA256; 400 `bad_signature`; duplicates 200 |
| POST | `/shipping/webhooks/mock` | signature | `MockCourier-Signature` (Phase 11) |
| GET | `/mock-pay/sessions/{ref}` | 🔒 buyer | MockPay page data (demo tools) |
| POST | `/mock-pay/sessions/{ref}/complete` | 🔒 buyer | `{outcome: success|failure}` → signed webhook (demo tools) |
| POST | `/mock-courier/orders/{id}/advance` | 🔒 participant | next tracking step → signed webhook (demo tools, Phase 11) |
| POST | `/demo/orders/{id}/fast-forward` | 🔒 participant | move the current deadline to now (demo tools, Phase 11) |

Demo tool routes exist only when `DEMO_TOOLS_ENABLED=true` (otherwise 404).

### Admin (Phase 12)
All need a token whose `app_metadata.role` is `admin` (403 `not_admin` otherwise). `/me` adds `is_admin`.
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/summary` | counts: open reports, escalated disputes, restricted users, open orders |
| GET | `/admin/reports` | `?status=open|reviewing|actioned|dismissed`, with target and reporter |
| POST | `/admin/reports/{id}` | `{status, note?, hide_listing?, restrict_user?}` |
| POST | `/admin/listings/{id}/moderation` | `{moderation: ok|hidden, note?}` |
| GET | `/admin/users` | `?q=` username search; restriction state |
| POST | `/admin/users/{username}/restriction` | `{restricted: bool, note?}` |
| GET | `/admin/disputes` | `?status=open|escalated|resolved` |
| POST | `/admin/disputes/{id}/resolve` | `{outcome: refund_buyer|release_seller, note}` |
| GET | `/admin/actions` | audit log, newest first |

## 3. Rate limits (initial values, tuned later)
| Action | Limit | Key |
|---|---|---|
| Start conversation | 20 / hour | user |
| Send message | 30 / minute, 500 / day | user |
| Make offer | 20 / hour | user |
| Create listing | 30 / day | user |
| Upload images | 60 / hour | user |
| Reports | 10 / day | user |
| Block/unblock | 30 / hour | user |
| Follow/unfollow | 60 / hour | user |
| Public search | 120 / minute | IP |
| Create order | 20 / hour | user |
| Pay / MockPay complete | 30 / hour | user |
| Withdraw | 10 / day | user |
| Dispute actions, reviews | 30 / day | user |
| Payment and shipping webhooks | 120 / minute | IP |

Built in Phase 6a (`app/core/ratelimit.py`): in-process sliding window, no extra dependency.
Over the limit → 429 `rate_limited` with `Retry-After` (seconds). Refused requests don't count.
Uploads count per photo. Block and unblock share one budget; so do follow and unfollow. Counts live in memory: they reset
when the server restarts or sleeps (one Render instance). The IP comes from the socket address;
`TRUSTED_PROXY_HOPS=1` on Render uses the entry the proxy appended to `X-Forwarded-For`
(earlier entries can be faked). `RATE_LIMITS_ENABLED=false` turns it off (tests only).

Sign-up, login, and password reset are rate-limited by Supabase Auth itself
(e.g. 30 sign-ups per 5 minutes per IP). Source: https://supabase.com/docs/guides/auth/rate-limits (checked 2026-10-10)

## 4. CORS and headers
- `allow_origins` from `CORS_ORIGINS` (local: `http://localhost:3100`). No wildcard with credentials.
- Methods: GET, POST, PATCH, PUT, DELETE. Headers: `Authorization`, `Content-Type`.
- Every response carries `X-Request-ID` for log correlation.
