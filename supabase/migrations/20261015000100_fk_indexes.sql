-- Phase 16: indexes on foreign keys that had none. They speed up joins, RLS
-- `exists` checks, and the cascade / set-null work when a parent row is deleted.
-- Nullable columns use partial indexes so the NULLs (set-null leftovers) take no space.

create index if not exists messages_sender_idx on app.messages (sender_id) where sender_id is not null;
create index if not exists offers_buyer_idx on app.offers (buyer_id) where buyer_id is not null;
create index if not exists offers_seller_idx on app.offers (seller_id) where seller_id is not null;
create index if not exists reports_listing_idx on app.reports (listing_id) where listing_id is not null;
create index if not exists reports_reported_user_idx
  on app.reports (reported_user_id) where reported_user_id is not null;
create index if not exists profiles_city_idx on app.profiles (city_id) where city_id is not null;
create index if not exists reviews_reviewer_idx
  on app.reviews (reviewer_id) where reviewer_id is not null;
create index if not exists admin_actions_admin_idx
  on app.admin_actions (admin_id) where admin_id is not null;
