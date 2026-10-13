-- Grants and row-level security. See docs/DATABASE_SCHEMA.md §6 and docs/SECURITY_PLAN.md.
-- Pattern: revoke everything, then grant only what each role needs, then RLS per action.
-- `(select auth.uid())` is wrapped so Postgres evaluates it once per statement.

-- ---------------------------------------------------------------------------
-- API login role
-- ---------------------------------------------------------------------------
-- FastAPI connects as api_app. It has no table privileges of its own (NOINHERIT
-- grants), so every query must first `SET LOCAL ROLE anon|authenticated`.
-- A forgotten role switch fails with "permission denied" instead of skipping RLS.
-- The password is set outside migrations (local: seed.sql; hosted: manually).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'api_app') then
    create role api_app login noinherit nobypassrls;
  end if;
end;
$$;
grant anon to api_app with inherit false, set true;
grant authenticated to api_app with inherit false, set true;

-- ---------------------------------------------------------------------------
-- Schema and default privileges
-- ---------------------------------------------------------------------------
revoke all on schema app from public;
grant usage on schema app to anon, authenticated;

revoke all on all tables in schema app from public, anon, authenticated;
revoke all on all sequences in schema app from public, anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;
alter default privileges in schema app revoke all on tables from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public, anon, authenticated;

-- Helper used inside policies must be executable by the caller.
grant execute on function app.is_blocked_between(uuid, uuid) to authenticated;

-- Public reference data
grant select on app.locations, app.categories to anon, authenticated;

-- Profiles: every column is public (no email or phone is stored here).
grant select on app.profiles to anon, authenticated;
grant update (username, display_name, bio, avatar_path, city_id) on app.profiles to authenticated;

-- Listings
grant select on app.listings to anon, authenticated;
grant insert (category_id, city_id, title, description, price_centavos, condition,
              meetup, delivery, deal_note, seller_id)
  on app.listings to authenticated;
grant update (category_id, city_id, title, description, price_centavos, condition,
              meetup, delivery, deal_note, status)
  on app.listings to authenticated;

-- Listing images
grant select on app.listing_images to anon, authenticated;
grant insert (listing_id, position, full_path, thumb_path, width, height)
  on app.listing_images to authenticated;
grant update (position) on app.listing_images to authenticated;
grant delete on app.listing_images to authenticated;

-- Favorites
grant select, delete on app.favorites to authenticated;
grant insert (user_id, listing_id) on app.favorites to authenticated;

-- Blocks
grant select, delete on app.blocked_users to authenticated;
grant insert (blocker_id, blocked_id) on app.blocked_users to authenticated;

-- Conversations
grant select on app.conversations to authenticated;
grant insert (listing_id, buyer_id) on app.conversations to authenticated;
grant update (buyer_last_read_at, seller_last_read_at) on app.conversations to authenticated;

-- Messages (users insert text only; offer/system messages come from triggers)
grant select on app.messages to authenticated;
grant insert (conversation_id, sender_id, kind, body) on app.messages to authenticated;

-- Offers
grant select on app.offers to authenticated;
grant insert (conversation_id, amount_centavos) on app.offers to authenticated;
grant update (status) on app.offers to authenticated;

-- Reports
grant select on app.reports to authenticated;
grant insert (reporter_id, target_type, listing_id, reported_user_id, reason, details)
  on app.reports to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table app.locations enable row level security;
alter table app.categories enable row level security;
alter table app.profiles enable row level security;
alter table app.listings enable row level security;
alter table app.listing_images enable row level security;
alter table app.favorites enable row level security;
alter table app.blocked_users enable row level security;
alter table app.conversations enable row level security;
alter table app.messages enable row level security;
alter table app.offers enable row level security;
alter table app.reports enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create policy locations_read on app.locations for select to anon, authenticated using (true);
create policy categories_read on app.categories for select to anon, authenticated
  using (is_active);

create policy profiles_read on app.profiles for select to anon, authenticated using (true);
create policy profiles_update_own on app.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Listings: public sees published, non-hidden listings; owners see all of theirs.
create policy listings_read_public on app.listings for select to anon, authenticated
  using (status in ('active', 'paused', 'sold') and moderation = 'ok');
create policy listings_read_own on app.listings for select to authenticated
  using (seller_id = (select auth.uid()));
create policy listings_insert_own on app.listings for insert to authenticated
  with check (seller_id = (select auth.uid()));
create policy listings_update_own on app.listings for update to authenticated
  using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()));

-- Images follow their listing's visibility; only the owner may change them.
create policy listing_images_read on app.listing_images for select to anon, authenticated
  using (exists (select 1 from app.listings l where l.id = listing_id));
create policy listing_images_insert_own on app.listing_images for insert to authenticated
  with check (exists (select 1 from app.listings l
                      where l.id = listing_id and l.seller_id = (select auth.uid())));
create policy listing_images_update_own on app.listing_images for update to authenticated
  using (exists (select 1 from app.listings l
                 where l.id = listing_id and l.seller_id = (select auth.uid())));
create policy listing_images_delete_own on app.listing_images for delete to authenticated
  using (exists (select 1 from app.listings l
                 where l.id = listing_id and l.seller_id = (select auth.uid())));

-- Favorites: only your own; only listings you can see.
create policy favorites_read_own on app.favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy favorites_insert_own on app.favorites for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from app.listings l
                          where l.id = listing_id and l.status in ('active', 'paused', 'sold')
                            and l.moderation = 'ok'));
create policy favorites_delete_own on app.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

-- Blocks: only your own list.
create policy blocks_read_own on app.blocked_users for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocks_insert_own on app.blocked_users for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy blocks_delete_own on app.blocked_users for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- Conversations: participants only.
create policy conversations_read on app.conversations for select to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id));
create policy conversations_insert_as_buyer on app.conversations for insert to authenticated
  with check (buyer_id = (select auth.uid()));
create policy conversations_update_read_marker on app.conversations for update to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id))
  with check ((select auth.uid()) in (buyer_id, seller_id));

-- Messages: participants read; you send only as yourself, only text.
create policy messages_read on app.messages for select to authenticated
  using (exists (select 1 from app.conversations c
                 where c.id = conversation_id
                   and (select auth.uid()) in (c.buyer_id, c.seller_id)));
create policy messages_insert on app.messages for insert to authenticated
  with check (sender_id = (select auth.uid())
              and kind = 'text'
              and exists (select 1 from app.conversations c
                          where c.id = conversation_id
                            and (select auth.uid()) in (c.buyer_id, c.seller_id)));

-- Offers: participants read; only the buyer of the conversation creates;
-- transitions by role are enforced by app.offers_guard.
create policy offers_read on app.offers for select to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id));
create policy offers_insert_as_buyer on app.offers for insert to authenticated
  with check (exists (select 1 from app.conversations c
                      where c.id = conversation_id and c.buyer_id = (select auth.uid())));
create policy offers_update_participant on app.offers for update to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id))
  with check ((select auth.uid()) in (buyer_id, seller_id));

-- Reports: you file and read your own; no edits or deletes.
create policy reports_read_own on app.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy reports_insert_own on app.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
