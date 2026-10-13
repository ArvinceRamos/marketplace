# Transactions Research: Vinted and Carousell

Researched 2026-10-13 from public help-centre pages (two research subagents). Fees and features
change by country and over time. These are **observations of public behaviour**, not claims about
internal systems. "Unconfirmed" means we found no official source.

## 1. Payment systems
| | Vinted (UK/EU/US) | Carousell SG/MY | Carousell PH |
|---|---|---|---|
| Holding money | "Buy now" only; money held until the order completes, then goes to the Vinted Balance (wallet; cannot be topped up) | "Buy" with Buyer Protection; held "until the item is confirmed to be received as listed" | **No in-app payment.** "Pay your seller after meeting and collecting the item" |
| Processor | EU: Vinted Pay (own e-money licence, from 5 Oct 2026); UK: Mangopay + Vinted Pay Ltd; US/AU: Adyen | Stripe (MY payout article names it) | — |
| Release to seller | Buyer taps "Everything is OK", or auto **2 days after delivery** (14 for Pro sellers) | Buyer taps "Order received", or auto: 2 days after tracked delivery; 5 + X days untracked; **9 days** after a meetup is confirmed | — |
| Buyer fee | US: $0.70 + 5% of item price; UK: 3–8% + £0.30–0.80 | SG: 3.5–6% (+5.5% BNPL); MY: 5–6.5% | — |
| Seller fee | None on a standard sale (paid bumps optional) | Mostly none; MY 5% in Beauty; SG Certified by contract | 2.5% on Pro accounts' chat deals (cap ₱2,250) |
| Payout | UK bank only, ≤ 5 business days, name must match | SG bank 1–4 days or card ~24h (1%); MY bank after ID check | — |
| Disputes | Buyer reports within 2 days → seller: partial refund, full refund, or return → else Vinted decides in 48h. Buyer pays return postage unless agreed | Seller has 24h to accept, counter, or escalate → Support decides: full refund, return + refund, or partial | Support can only restrict accounts; no refunds |

Sources: vinted.co.uk/help/551, /94, /1558, /272, vinted.com/pricelist, vinted.com/help/1653,
valueaddedresource.net (Vinted terms Oct 2026); support.carousell.com articles 115006305247,
360038049033, 360001513347, 360000970147, 360039263993, 360020646673, 18271789237017,
115013288248, 50996750217113.

## 2. Shipping and delivery
- **Vinted:** buyer always pays shipping and picks from the carriers the seller enabled. After
  payment Vinted sends a prepaid label; using another label or carrier cancels the order. Ship
  within **5 business days** (extendable) or the order auto-cancels and refunds. Carrier status is
  pulled into the order page; "delivered" starts the 2-day window. Lost parcels: after 25 business
  days the buyer is asked; "not arrived" refunds the buyer. Vinted Go lockers in FR/Benelux/ES-PT.
  Custom shipping (oversized) has no integrated tracking or protection. Help pages 234, 753, 657, 673.
- **Carousell SG/MY:** in-app labels (Ninja Van, J&T, SingPost/SPX; MY: SPX, Pos Laju).
  Unshipped orders auto-cancel **6 days** after purchase. Courier "delivered" starts the 2-day
  timer. Help articles 30783238615961, 360037564294, 59217223932697.
- **Carousell PH:** no integrated courier, label, or tracking found. Delivery is arranged in chat.

## 3. COD and in-person meetups
- **Vinted:** no meetups or COD. Selling in person gives no protection and no payout; off-platform
  payment is fought with policy, warnings, and bans (help/214, /81, /349).
- **Carousell (all markets, the only flow in PH):** Make Offer → seller **Accept** (irreversible,
  "commitment to deal", unlocks reviews) → optional **Reserve** → **Mark as Sold** → reviews.
  Reviews: 30 days to write, double-blind (published when both write or after 14 days), one edit.
  SG/MY meetup with Buyer Protection: seller confirms within 3 days (else refund); auto-release 9
  days later. COD: none in PH (only Taiwan via 7-ELEVEN).
- **Carousell anti-scam:** chat blocks links, emails, QR codes; warns (not blocks) on phone
  numbers; badges in chat (New user, Not verified, Verified); warning when the other user is
  under review or restricted; phone verification to list; reply caps for new buyers in PH; safe
  meetup guidance. Articles 49165093814425, 36263482237849, 115009696128, 31073178907801.

## 4. Order state machines (inferred)
**Vinted:** checkout → paid (held, label issued) → shipped (carrier scan) → delivered → completed
("Everything is OK" or 2 days) · branches: not shipped in 5 days → cancelled + refunded; issue
reported → disputed → refunded / return → refunded / completed; lost after 25 days → refunded.

**Carousell chat deal:** listed → offer made → offer accepted → (reserved) → sold → reviewed.
No completion signal; money moves outside the app.

**Carousell Buy order (SG/MY):** paid → shipped (or auto-cancel at 6 days) → delivered →
completed (received or auto) → funds available → withdrawn. Meetup variant: paid → deal confirmed
(3 days) → completed (received or 9 days). Disputes before completion → 24h seller response →
refunded / partially refunded / return then refund / released.

## 5. Structural difference
- **Vinted = closed loop.** Every sale runs through payment, label, tracking, and a release timer.
  The platform owns the whole state machine; trust comes from the system.
- **Carousell = local-first.** The core is chat + offers with money outside the app; escrow is an
  add-on only where licences allow (not PH). Trust comes from reviews, badges, chat filtering,
  warnings, and moderation.

## 6. What this project takes from it (decided 2026-10-13)
A hybrid: keep the Carousell-style chat deals (Phases 1–7) and add a **simulated** Vinted-style
protected checkout. Nothing moves real money. Details: `docs/TRANSACTIONS_DESIGN.md`.
- Taken: escrow-until-confirmed, 2-day auto-release after delivery, ship-by deadline with
  auto-cancel + refund, buyer fee (₱15 + 5%), seller fee ₱0, wallet + withdrawal, double-blind
  reviews tied to a completed order, seller-first dispute step then platform decision,
  "restricted user" warning in chat.
- Our own: a **6-digit handover code** for meetups (buyer gives it after inspecting the item; the
  seller enters it to complete). Stronger than a 9-day timer, and it also records cash meetups.
- Left out: real providers and licences (BSP), KYC, real couriers and labels, lockers, BNPL,
  returns and partial refunds, verified badges, AI fee estimates.
