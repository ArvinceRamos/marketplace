# Product Requirements

Last updated: 2026-10-13 · Status: Phases 1–8 built; Phases 9–13 add simulated payments (see §9)

## 1. Summary
A classifieds marketplace for the Philippines. Sellers post items. Buyers find them, chat,
make offers, and arrange pickup, meetup, or delivery **on their own**. The app never handles
money, shipping, or refunds in the MVP. From Phase 10 there is also an optional **simulated**
protected checkout (test mode only, no real money); see §9 and `TRANSACTIONS_DESIGN.md`.

It is inspired by the public features of Carousell PH. It uses original branding, styling,
copy, and seed data. Nothing is copied from Carousell's code, logo, photos, or text.

## 2. Research: what Carousell PH does publicly
Checked on 2026-10-10 by viewing public pages as a guest. These are **observations**, not claims
about Carousell's internal systems.

| Area | Observed public behavior | Source |
|---|---|---|
| Header | Logo, top category links, sign up, log in, a "Sell" button, item search box plus a separate location box ("All of the Philippines") | https://www.carousell.ph/ |
| Homepage | Search, trending terms, featured categories, sections for property, cars, popular goods, a "slashed prices" strip, "Recommended for you", testimonials | https://www.carousell.ph/ |
| Listing card | Seller username, relative time ("3 days ago"), photo, title, PHP price, old price struck through when reduced, condition, like count | https://www.carousell.ph/ |
| Search | URL-based (`/search/<term>`); result count; chips for Category, Sort, Brand, Condition, Price, Deal options; "Save this search" | https://www.carousell.ph/search/laptop/ |
| Sort | Best match, Recent, Price high→low, Price low→high, Nearby | same page, filter panel |
| Conditions | Brand new, Like new, Lightly used, Well used, Heavily used (each with a short explanation) | listing pages |
| Listing page | Photo carousel, like button, "More actions" menu, title, price, condition, meetup location, description, posted time, brand, "Meet the seller" box (joined date, reviews), Chat button, Make Offer | https://www.carousell.ph/p/hp-probook-laptop-intel-core-i5-1466957524/ |
| Photos | Up to 10 photos per listing (20 for property in PH) | https://support.carousell.com/hc/en-us/articles/115006305047 |
| Chat | Chats start from a listing. New-chat rate limits pause spam-like activity | https://support.carousell.com/hc/en-us/articles/115006560428 · https://support.carousell.com/hc/en-us/articles/54458033412121 |
| Chat rules | Sharing phone numbers, emails, and links in chat is not allowed, to reduce phishing | https://support.carousell.com/hc/en-us/articles/23098039280793 |
| Offers | Buyer makes an offer in chat; seller accepts. Acceptance is described as a commitment to deal and is irreversible. Multiple accepts are possible for multi-quantity items | https://support.carousell.com/hc/en-us/articles/115006305247 · https://support.carousell.com/hc/en-us/articles/115006383427 |
| Sold | "Mark as sold" from chat or listing; users cannot undo it themselves; offers stop after sold. "Reserve" status also exists | https://support.carousell.com/hc/en-us/articles/115006245027 · https://support.carousell.com/hc/en-us/articles/115006245087 |
| Reviews | Unlocked after offer + acceptance; tied to a transaction; platform does not mediate disputes | https://support.carousell.com/hc/en-us/articles/360018880254 · https://support.carousell.com/hc/en-us/articles/360001177087 |
| Blocking | Hides the blocked user's chats and notifications; the blocked user is not told | https://support.carousell.com/hc/en-us/articles/115015822707 |
| Likes | Liked listings are viewable from the user's page | https://support.carousell.com/hc/en-us/articles/115006382467 |
| Lifecycle | Unsold listings are not auto-removed; deleting asks for confirmation | https://support.carousell.com/hc/en-us/articles/115006383447 · https://support.carousell.com/hc/en-us/articles/115006245467 |
| Safety | Large help section on scams and phishing; advice to inspect items and meet in safe places | https://support.carousell.com/hc/en-us/articles/115009696128 |
| Monetization (out of scope) | Bumps, Spotlight, coins, business subscriptions, listing quotas, "Buy" button with buyer protection | Help Centre "Selling" section |

### Where our design deliberately differs
- **Reviews:** Carousell unlocks reviews on an accepted offer. Your requirements say an accepted
  offer is not proof of a completed deal. Our later design asks **both** sides to confirm the deal
  is completed before reviews unlock.
- **Mark as sold:** We allow the seller to undo "sold" back to "paused" (simpler support for one developer).
- **No paid features**, no in-app payment, no buyer protection, no ads.
- **Contact info in chat:** We show a warning about sharing contact details and links. We do not
  block them in the MVP (detection is error-prone). Revisit in Phase 6.

## 3. Users and roles
Every signed-in user can buy and sell. There is no separate seller account.

| Role | Can do |
|---|---|
| Guest | Browse, search, filter, sort, view listings, categories, and public seller profiles |
| User (buyer side) | Everything a guest can, plus profile, favorites, chat, offers (make/withdraw), report, block |
| User (seller side) | Create, edit, publish, pause, mark sold, delete own listings; upload photos; answer chats; accept/reject offers |
| Admin (Phase 12) | Review reports, hide listings, restrict users, decide escalated disputes. Set only server-side (`app_metadata.role`); never chosen by the client |

## 4. MVP scope (Phases 1–7)

| Feature | MVP | Notes |
|---|---|---|
| Homepage | ✅ | Search, categories, recent listings, Sell button, loading/empty/error states |
| Search & filters | ✅ | Text, category, price range, condition, city, sort (newest, price ↑/↓), pagination, URL params |
| Listing details | ✅ | All fields from the brief, photo gallery, favorite, chat, offer, report |
| Auth & profiles | ✅ | Supabase Auth, profile edit, avatar, public seller page |
| Create/manage listings | ✅ | Draft → active ⇄ paused → sold; soft delete; up to 8 photos (see FREE_TIER_LIMITATIONS) |
| Messaging | ✅ | Persisted, per listing, unread indicator, polling (no Realtime at first) |
| Offers | ✅ | Pending, accepted, rejected, withdrawn, expired; history shown in chat |
| Favorites | ✅ | Save, remove, list |
| Report & block | ✅ | Report listing or user; block user |
| Safety guidance | ✅ | Safety page and in-chat tips; "payments happen outside the app" notice |
| Privacy & account deletion | ✅ | Privacy notice and self-service account deletion (PH Data Privacy Act) |

## 5. Later releases (not MVP)
| Feature | Why later |
|---|---|
| Deal completion + reviews | Needs a two-sided confirmation flow first |
| Admin moderation screens | Reports are stored now; review via Supabase dashboard until then |
| Realtime chat | Polling first; Realtime only if free limits fit |
| Reserved status, saved searches, "nearby" sort | Nice to have |
| Email/push notifications | Free email limits are tight (see FREE_TIER_LIMITATIONS) |
| Contact-info blocking in chat | Needs reliable detection |
| Mobile app | Website first |

## 6. Non-goals
**Real** payments, escrow, wallets, payouts, shipping integrations, and delivery tracking (Phases
10–12 only **simulate** them in test mode); returns and partial refunds; KYC; paid promotion, ads,
verified badges, AI pricing. We never say users, items, or deals are "verified" because nothing is
verified.

## 7. Business rules
1. A user cannot chat about, offer on, or favorite their own listing, and cannot review themselves.
2. Only the owner can change a listing. Ownership comes from the verified token, never the request body.
3. New chats and new offers are only allowed on **active** listings.
4. On sold, paused, or deleted listings, existing chats stay readable; sending text is still allowed,
   but new offers are blocked.
5. One pending offer per conversation at a time. Accepting an offer does not move money and does not mark the item sold.
6. Blocked users cannot start chats with, message, or make offers to the user who blocked them.
7. Price: whole pesos to centavos, ₱0 to ₱100,000,000. ₱0 is allowed for free items.
8. Users must be 18 or older to register (checkbox at sign-up). Confirmed 2026-10-10.

## 8. Success criteria for MVP
- A guest can find an item by text and filters in under three clicks.
- A seller can publish a listing with photos on a phone screen.
- A buyer and seller can chat and settle on an offer.
- Every security test in `SECURITY_PLAN.md` passes, including unauthorized-access tests.
- Monthly running cost stays ₱0 for a small group of test users.

## 9. Phases 9–13: simulated transactions (approved 2026-10-13)
Goal: a fully working portfolio build that shows how a protected marketplace checkout works,
without real money, provider accounts, or fees. Research: `research/TRANSACTIONS_RESEARCH.md`.
Design: `TRANSACTIONS_DESIGN.md`.

| Feature | Phase | Notes |
|---|---|---|
| Buy button, checkout, orders, MockPay, signed webhooks, ledger, wallet + demo withdrawal, reserved listings | 10 | Online / cash / COD; meetup / delivery; buyer fee ₱15 + 5% |
| Ship + fake tracking, handover code, COD remittance, auto timers, demo fast-forward, reviews | 11 | Reviews only after a completed order; double-blind |
| Disputes, admin moderation (reports, listings, users, disputes, audit log), restricted users | 12 | Admin via `app_metadata.role` |
| Release checks, demo data for every order state, README test-mode guide | 13 | |

Business rules added:
9. Amounts are always computed by the server; a request never carries a price or fee.
10. One open order per listing; an order reserves the listing.
11. Money held for an online order is released only by the buyer's confirmation, the handover
    code, a timer, or an admin decision; refunds always return the full total.
12. Every money page shows "Test mode — no real money". The app never asks for card or bank details.
