# API Specification

Last updated: 2026-10-10 · Status: Phase 0 design. FastAPI also serves live OpenAPI docs at
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
| GET | `/categories` | 🔓 | tree; cacheable |
| GET | `/locations` | 🔓 | regions → cities; cacheable |
| GET | `/profiles/{username}` | 🔓 | public fields only: username, display_name, avatar_url, city, bio, joined_at, active_listing_count |
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
  "deal_note": "SM North EDSA, weekends"
}
```
Listing response (card): `id, title, price_centavos, condition, status, city {name}, cover_thumb_url, seller {username, display_name, avatar_url}, published_at`. (`favorite_count` arrives with favorites in Phase 5.)
Detail adds: `description, category {id, slug, name}, parent_category, images[{id, full_url, thumb_url, width, height, position}], meetup, delivery, deal_note, created_at, updated_at, is_owner`.
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
| GET | `/me/favorites` | 🔒 | paginated; includes unavailable items with status |

### Conversations and messages
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/listings/{id}/conversations` | 🔒 | get-or-create as buyer; 409 if own listing or not active; 403 if blocked either way |
| GET | `/conversations` | 🔒 | inbox: `id, listing{id,title,thumb,status}, other_user, last_message{preview,at}, unread_count`; `?role=buying|selling` |
| GET | `/conversations/{id}` | 🔒 participant | header info + listing state + latest offer |
| GET | `/conversations/{id}/messages` | 🔒 participant | keyset paging |
| POST | `/conversations/{id}/messages` | 🔒 participant | `{body}` 1–2,000 chars; 403 if blocked |
| POST | `/conversations/{id}/read` | 🔒 participant | sets my `last_read_at` |
| GET | `/me/unread-count` | 🔒 | total unread for the nav badge (cheap; polled) |

### Offers
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/conversations/{id}/offers` | 🔒 participant | history, newest first |
| POST | `/conversations/{id}/offers` | 🔒 buyer | `{amount_centavos}`; 409 if pending exists or listing not active |
| POST | `/offers/{id}/accept` | 🔒 seller | pending → accepted |
| POST | `/offers/{id}/reject` | 🔒 seller | pending → rejected |
| POST | `/offers/{id}/withdraw` | 🔒 buyer | pending → withdrawn |
Each transition also writes an `offer`/`system` message in the same DB transaction.

### Reports and blocks
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/reports` | 🔒 | `{target_type, listing_id?, user_id?, reason, details?}`; 409 if open duplicate; 422 if self |
| GET | `/me/reports` | 🔒 | own reports and their status |
| GET | `/me/blocks` | 🔒 | blocked users |
| PUT | `/users/{id}/block` | 🔒 | idempotent; 422 if self |
| DELETE | `/users/{id}/block` | 🔒 | idempotent |

### Later (designed, not in MVP)
`POST /offers/{id}/deal`, `POST /deals/{id}/confirm`, `POST /deals/{id}/reviews`,
`GET /profiles/{username}/reviews`, and `/admin/*` routes guarded by a server-side check of
`app_metadata.role == "admin"` from the verified token.

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
| Public search | 120 / minute | IP |
Sign-up, login, and password reset are rate-limited by Supabase Auth itself
(e.g. 30 sign-ups per 5 minutes per IP). Source: https://supabase.com/docs/guides/auth/rate-limits (checked 2026-10-10)

## 4. CORS and headers
- `allow_origins` from `CORS_ORIGINS` (local: `http://localhost:3100`). No wildcard with credentials.
- Methods: GET, POST, PATCH, PUT, DELETE. Headers: `Authorization`, `Content-Type`.
- Every response carries `X-Request-ID` for log correlation.
