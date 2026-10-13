-- Phase 10: listings can be reserved by an order (docs/TRANSACTIONS_DESIGN.md §4).
-- A new enum value cannot be used in the transaction that adds it, so it gets its
-- own migration; the next one uses it.
alter type app.listing_status add value if not exists 'reserved';
