-- Phase 14: fixes from docs/AUDIT_2026-10-13.md (A1–A8, escalation fallback).
-- TEST MODE ONLY: no real money moves.

-- ---------------------------------------------------------------------------
-- Disputes: seller reports, who opened, and a deadline for moderators
-- ---------------------------------------------------------------------------
-- A2: the seller can report "the buyer took the item without giving the code".
alter type app.dispute_reason add value if not exists 'taken_without_code';

alter table app.disputes
  add column opened_by text not null default 'buyer' check (opened_by in ('buyer', 'seller')),
  -- Escalated disputes without a moderator decision are refunded after 14 days.
  add column decide_by timestamptz;

create function app.disputes_deadlines() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'escalated'
     and (tg_op = 'INSERT' or old.status is distinct from 'escalated') then
    new.decide_by := now() + interval '14 days';
  elsif new.status <> 'escalated' then
    new.decide_by := null;
  end if;
  return new;
end;
$$;
create trigger disputes_deadlines before insert or update of status on app.disputes
  for each row execute function app.disputes_deadlines();

update app.disputes set decide_by = updated_at + interval '14 days' where status = 'escalated';

-- ---------------------------------------------------------------------------
-- Orders: what the listing said when it was bought (A5)
-- ---------------------------------------------------------------------------
alter table app.orders
  add column description text check (char_length(description) <= 5000),
  add column condition app.listing_condition;

-- ---------------------------------------------------------------------------
-- Listings: no edits while reserved (A5) or restricted (A6)
-- ---------------------------------------------------------------------------
create function app.listings_content_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if (new.title, new.description, new.category_id, new.city_id, new.price_centavos,
      new.condition, new.meetup, new.delivery, new.deal_note, new.size,
      new.payment_methods, new.couriers)
     is distinct from
     (old.title, old.description, old.category_id, old.city_id, old.price_centavos,
      old.condition, old.meetup, old.delivery, old.deal_note, old.size,
      old.payment_methods, old.couriers) then
    if old.status = 'reserved' then
      raise exception 'this item is reserved for an order' using errcode = '23514';
    end if;
    if app.is_restricted(old.seller_id) then
      raise exception 'your account is restricted' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger listings_content_guard before update on app.listings
  for each row execute function app.listings_content_guard();

create function app.listing_images_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  l record;
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;
  select status, seller_id into l from app.listings
   where id = coalesce(new.listing_id, old.listing_id);
  if l.status = 'reserved' then
    raise exception 'this item is reserved for an order' using errcode = '23514';
  end if;
  if tg_op <> 'DELETE' and app.is_restricted(l.seller_id) then
    raise exception 'your account is restricted' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger listing_images_guard before insert or update or delete on app.listing_images
  for each row execute function app.listing_images_guard();

-- ---------------------------------------------------------------------------
-- Unpaid orders (cash meetup, COD): shorter hold, at most 3 open per buyer (A3)
-- ---------------------------------------------------------------------------
create or replace function app.order_set_confirmed(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  hold interval;
begin
  select case when payment_method = 'online' then null else interval '3 days' end
    into hold from app.orders where id = p_id;
  update app.orders set
    status = 'confirmed',
    paid_at = case when payment_method = 'online' then now() end,
    payment_due_at = null,
    ship_by = case when fulfilment = 'delivery'
                   then now() + coalesce(hold, interval '5 days') end,
    meet_by = case when fulfilment = 'meetup'
                   then now() + coalesce(hold, interval '7 days') end
  where id = p_id;
end;
$$;

create or replace function app.order_create(
  p_listing uuid, p_offer uuid, p_fulfilment app.order_fulfilment,
  p_payment app.order_payment, p_courier text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  t record;
  new_id uuid;
  stale uuid;
begin
  -- An abandoned checkout must not block the listing forever.
  for stale in select id from app.orders
                where listing_id = p_listing and app.order_is_open(status) loop
    perform app.order_apply_timers(stale);
  end loop;
  -- Lock the listing so two buyers can't both pass the checks.
  perform 1 from app.listings where id = p_listing for update;

  select * into t from app.order_terms(me, p_listing, p_offer, p_fulfilment, p_payment, p_courier);

  if p_payment <> 'online' then
    -- One buyer per user at a time is enough; this lock keeps the count honest.
    perform pg_advisory_xact_lock(hashtextextended('unpaid_orders:' || me::text, 0));
    if (select count(*) from app.orders
        where buyer_id = me and payment_method <> 'online' and app.order_is_open(status)) >= 3 then
      raise exception using errcode = 'MK409', message = 'too_many_unpaid_orders',
        hint = 'You have 3 open cash or COD orders. Finish or cancel one first.';
    end if;
  end if;

  insert into app.orders (
    listing_id, buyer_id, seller_id, offer_id, title, cover_path, fulfilment, payment_method,
    courier, item_price_centavos, shipping_fee_centavos, buyer_fee_centavos, total_centavos,
    status, payment_due_at, description, condition
  ) select
    p_listing, me, t.seller_id, p_offer, t.title, t.cover_path, p_fulfilment, p_payment,
    p_courier, t.item, t.shipping, t.fee, t.total,
    'pending_payment', now() + interval '30 minutes', l.description, l.condition
  from app.listings l where l.id = p_listing
  returning id into new_id;

  if p_payment <> 'online' then
    perform app.order_set_confirmed(new_id);  -- cash and COD need no payment step
  end if;
  if p_fulfilment = 'meetup' then
    insert into app.order_secrets (order_id, handover_code)
    values (new_id, app.new_handover_code());
  end if;
  update app.listings set status = 'reserved' where id = p_listing;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Paid meetups: the buyer can't cancel alone (A2)
-- ---------------------------------------------------------------------------
create or replace function app.order_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
begin
  o := app.order_lock_for(me, p_id);
  if me = o.buyer_id and o.status = 'confirmed' and o.fulfilment = 'meetup'
     and o.payment_method = 'online' then
    raise exception using errcode = 'MK409', message = 'ask_seller_to_cancel',
      hint = 'You''ve paid for this meetup, so only the seller can cancel it. Ask them in chat.';
  end if;
  if (me = o.buyer_id and o.status in ('pending_payment', 'confirmed'))
     or (me = o.seller_id and o.status = 'confirmed') then
    perform app.order_set_cancelled(p_id, case when me = o.buyer_id then 'buyer' else 'seller' end);
  else
    raise exception using errcode = 'MK409', message = 'cannot_cancel',
      hint = 'This order can''t be cancelled now.';
  end if;
end;
$$;

-- Seller: the buyer left with the item but didn't give the code. Goes straight to a moderator.
create function app.dispute_report_buyer(p_id uuid, p_details text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
begin
  o := app.order_lock_for(me, p_id);
  if me <> o.seller_id then
    raise exception using errcode = 'MK403', message = 'not_seller',
      hint = 'Only the seller can report this.';
  end if;
  if o.fulfilment <> 'meetup' or o.payment_method <> 'online' or o.status <> 'confirmed' then
    raise exception using errcode = 'MK409', message = 'cannot_report',
      hint = 'You can report this only for a paid meetup that is waiting for the handover.';
  end if;
  insert into app.disputes (order_id, reason, details, status, opened_by)
  values (p_id, 'taken_without_code', nullif(btrim(p_details), ''), 'escalated', 'seller');
  update app.orders set status = 'disputed', meet_by = null where id = p_id;
end;
$$;

-- Buyers report delivery problems only (the seller's reason is not theirs to use).
create or replace function app.dispute_open(p_id uuid, p_reason app.dispute_reason, p_details text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
begin
  o := app.order_lock_for(me, p_id);
  if me <> o.buyer_id then
    raise exception using errcode = 'MK403', message = 'not_buyer',
      hint = 'Only the buyer can report a problem.';
  end if;
  if o.payment_method <> 'online'
     or not ((o.status = 'shipped' and p_reason = 'not_received')
             or (o.status = 'delivered' and p_reason in ('not_as_described', 'incomplete'))) then
    raise exception using errcode = 'MK409', message = 'cannot_dispute',
      hint = 'You can''t report this problem for this order now.';
  end if;
  insert into app.disputes (order_id, reason, details, respond_by)
  values (p_id, p_reason, nullif(btrim(p_details), ''), now() + interval '48 hours');
  update app.orders set status = 'disputed', confirm_by = null where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Timers: escalated disputes without a decision in 14 days refund the buyer
-- ---------------------------------------------------------------------------
create or replace function app.order_apply_timers(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o app.orders;
  d app.disputes;
begin
  select * into o from app.orders where id = p_id for update;
  if not found then
    return;
  end if;
  if o.status = 'pending_payment' and o.payment_due_at < now() then
    perform app.order_set_cancelled(p_id, 'payment_expired');
  elsif o.status = 'confirmed' and o.ship_by < now() then
    perform app.order_set_cancelled(p_id, 'not_shipped');
  elsif o.status = 'confirmed' and o.meet_by < now() then
    perform app.order_set_cancelled(p_id, 'not_met');
  elsif o.status = 'delivered' and o.confirm_by < now() then
    perform app.order_set_completed(p_id);
  elsif o.status = 'disputed' then
    update app.disputes set status = 'escalated', respond_by = null
     where order_id = p_id and status = 'open' and respond_by < now();
    select * into d from app.disputes
     where order_id = p_id and status = 'escalated' and decide_by < now() for update;
    if found then
      update app.disputes set admin_note = 'No moderator decision within 14 days: refunded.'
       where id = d.id;
      perform app.dispute_resolve(d.id, 'refunded');
    end if;
  end if;
end;
$$;

create or replace function app.orders_tick_mine() returns void
language plpgsql security definer set search_path = '' as $$
declare
  oid uuid;
begin
  for oid in select o.id from app.orders o
              where (select auth.uid()) in (o.buyer_id, o.seller_id)
                and app.order_is_open(o.status)
                and (least(o.payment_due_at, o.ship_by, o.meet_by, o.confirm_by) < now()
                     or exists (select 1 from app.disputes d where d.order_id = o.id
                                and ((d.status = 'open' and d.respond_by < now())
                                     or (d.status = 'escalated' and d.decide_by < now())))) loop
    perform app.order_apply_timers(oid);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Demo fast-forward: only the side that is waiting may skip (A1)
-- ---------------------------------------------------------------------------
create or replace function app.demo_fast_forward(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
  past timestamptz := now() - interval '1 second';
begin
  o := app.order_lock_for(me, p_id);
  if o.status = 'pending_payment' then
    update app.orders set payment_due_at = past where id = p_id;
    return 'payment_due_at';
  elsif o.status = 'confirmed' and o.ship_by is not null then
    update app.orders set ship_by = past where id = p_id;
    return 'ship_by';
  elsif o.status = 'confirmed' and o.meet_by is not null then
    -- A paid meetup ends in a refund; the buyer must not skip the seller's chance to report.
    if o.payment_method = 'online' and me <> o.seller_id then
      raise exception using errcode = 'MK403', message = 'cannot_skip',
        hint = 'In the demo, only the seller can skip the meetup deadline of a paid order.';
    end if;
    update app.orders set meet_by = past where id = p_id;
    return 'meet_by';
  elsif o.status = 'delivered' then
    -- Skipping releases the money; only the buyer may give up their 2 days.
    if me <> o.buyer_id then
      raise exception using errcode = 'MK403', message = 'cannot_skip',
        hint = 'In the demo, only the buyer can skip the 2-day check.';
    end if;
    update app.orders set confirm_by = past where id = p_id;
    return 'confirm_by';
  elsif o.status = 'disputed' then
    update app.disputes set respond_by = past where order_id = p_id and status = 'open';
    if found then
      return 'respond_by';
    end if;
    -- The 14-day fallback refunds the buyer, so only the seller may skip it.
    if me = o.seller_id then
      update app.disputes set decide_by = past where order_id = p_id and status = 'escalated';
      if found then
        return 'decide_by';
      end if;
    end if;
  end if;
  return 'none';
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderators can't decide their own disputes (A7)
-- ---------------------------------------------------------------------------
create or replace function app.admin_resolve_dispute(p_dispute uuid, p_outcome text, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  d app.disputes;
begin
  perform app.require_admin();
  if p_outcome not in ('refund_buyer', 'release_seller') then
    raise exception using errcode = 'MK422', message = 'invalid_outcome',
      hint = 'Choose refund buyer or release to seller.';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception using errcode = 'MK422', message = 'note_required',
      hint = 'Add a short note explaining the decision.';
  end if;
  select * into d from app.disputes where id = p_dispute for update;
  if not found then
    raise exception using errcode = 'MK404', message = 'dispute_not_found',
      hint = 'This dispute was not found.';
  end if;
  if exists (select 1 from app.orders where id = d.order_id
             and (select auth.uid()) in (buyer_id, seller_id)) then
    raise exception using errcode = 'MK403', message = 'own_dispute',
      hint = 'Another moderator must decide a dispute you take part in.';
  end if;
  if d.status = 'resolved' then
    raise exception using errcode = 'MK409', message = 'dispute_resolved',
      hint = 'This dispute is already resolved.';
  end if;
  perform 1 from app.orders where id = d.order_id for update;
  update app.disputes set admin_note = btrim(p_note) where id = p_dispute;
  perform app.dispute_resolve(
    p_dispute, case when p_outcome = 'refund_buyer' then 'refunded' else 'released' end);
  perform app.admin_log('dispute_' || p_outcome, 'dispute', p_dispute, p_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ratings: one review counts per reviewer–reviewee pair (latest), so repeat
-- orders between the same two accounts can't pile up stars (A4)
-- ---------------------------------------------------------------------------
create or replace function app.public_reviews(p_profile uuid)
returns table (rating smallint, comment text, created_at timestamptz, title text,
               by_buyer boolean, reviewer_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct on (coalesce(r.reviewer_id, r.id))
         r.rating, r.comment, r.created_at, o.title, r.reviewer_id = o.buyer_id, r.reviewer_id
  from app.reviews r join app.orders o on o.id = r.order_id
  where r.reviewee_id = p_profile and app.review_is_public(r.order_id)
  order by coalesce(r.reviewer_id, r.id), r.created_at desc;
$$;

create or replace function app.rating_summary(p_profile uuid)
returns table (average numeric, total bigint)
language sql stable security definer set search_path = '' as $$
  select round(avg(r.rating)::numeric, 1), count(*)
  from app.public_reviews(p_profile) r;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function
  app.disputes_deadlines(), app.listings_content_guard(), app.listing_images_guard(),
  app.dispute_report_buyer(uuid, text)
  from public, anon, authenticated;
grant execute on function app.dispute_report_buyer(uuid, text) to authenticated;
