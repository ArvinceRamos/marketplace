-- Phase 11: fulfilment (shipping + simulated tracking, meetup handover code, COD),
-- completion timers, demo fast-forward, and reviews. Design: docs/TRANSACTIONS_DESIGN.md §7, §9.
-- TEST MODE ONLY: tracking comes from the built-in MockCourier; no courier is contacted.

create type app.shipment_status as enum
  ('label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered');

-- ---------------------------------------------------------------------------
-- Shipments
-- ---------------------------------------------------------------------------
create table app.shipments (
  order_id uuid primary key references app.orders (id) on delete cascade,
  courier text not null check (courier in ('jnt', 'flash', 'lbc', 'lalamove', 'grab')),
  tracking_number text not null unique check (tracking_number ~ '^DEMO-[A-Z]+-[0-9]{10}$'),
  status app.shipment_status not null default 'label_created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shipments_updated_at before update on app.shipments
  for each row execute function app.set_updated_at();

create table app.shipment_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references app.shipments (order_id) on delete cascade,
  status app.shipment_status not null,
  created_at timestamptz not null default now()
);
create index shipment_events_order_idx on app.shipment_events (order_id, id);

-- ---------------------------------------------------------------------------
-- Ledger: cash on delivery. The courier collects cash from the buyer and remits
-- the item price to the seller; shipping stays with the courier.
-- ---------------------------------------------------------------------------
create function app.ledger_cod_remit(o app.orders) returns void
language plpgsql security definer set search_path = '' as $$
declare
  txn uuid := gen_random_uuid();
begin
  insert into app.ledger_entries (txn_id, order_id, account, user_id, amount_centavos, memo)
  select txn, o.id, a, u, amt, m from (values
    ('external'::app.ledger_account, o.buyer_id,
     -(o.item_price_centavos + o.shipping_fee_centavos), 'Cash on delivery: ' || o.title),
    ('courier', null::uuid, o.shipping_fee_centavos, 'Shipping fee (COD)'),
    ('seller', o.seller_id, o.item_price_centavos, 'Sale (COD): ' || o.title)
  ) as v(a, u, amt, m)
  where amt <> 0;
end;
$$;

create or replace function app.order_set_completed(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o app.orders;
begin
  select * into o from app.orders where id = p_id;
  if o.payment_method = 'online' then
    perform app.ledger_release(o);
  elsif o.payment_method = 'cod' then
    perform app.ledger_cod_remit(o);
  end if;
  update app.orders set status = 'completed', completed_at = now(), confirm_by = null,
         ship_by = null, meet_by = null
   where id = p_id;
  perform app.listing_mark_sold(o.listing_id);
end;
$$;

-- Timers: Phase 10's plus auto-complete 2 days after delivery.
create or replace function app.order_apply_timers(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o app.orders;
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
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Order actions (signed-in user)
-- ---------------------------------------------------------------------------
create function app.order_ship(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
  tracking text;
begin
  o := app.order_lock_for(me, p_id);
  if me <> o.seller_id then
    raise exception using errcode = 'MK403', message = 'not_seller',
      hint = 'Only the seller can ship.';
  end if;
  if o.fulfilment <> 'delivery' or o.status <> 'confirmed' then
    raise exception using errcode = 'MK409', message = 'cannot_ship',
      hint = 'This order can''t be shipped now.';
  end if;
  tracking := 'DEMO-' || upper(o.courier) || '-'
    || lpad(((('x' || encode(extensions.gen_random_bytes(5), 'hex'))::bit(40)::bigint)
             % 10000000000)::text, 10, '0');
  insert into app.shipments (order_id, courier, tracking_number) values (p_id, o.courier, tracking);
  insert into app.shipment_events (order_id, status) values (p_id, 'label_created');
  update app.orders set status = 'shipped', shipped_at = now(), ship_by = null where id = p_id;
end;
$$;

-- Buyer: "Everything is OK" (online delivery). Releases the money to the seller.
create function app.order_confirm_received(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
begin
  o := app.order_lock_for(me, p_id);
  if me <> o.buyer_id then
    raise exception using errcode = 'MK403', message = 'not_buyer',
      hint = 'Only the buyer can confirm.';
  end if;
  if o.payment_method <> 'online' or o.status not in ('shipped', 'delivered') then
    raise exception using errcode = 'MK409', message = 'cannot_confirm',
      hint = 'This order can''t be confirmed now.';
  end if;
  if o.delivered_at is null then
    update app.orders set delivered_at = now() where id = p_id;
  end if;
  perform app.order_set_completed(p_id);
end;
$$;

-- Seller enters the buyer's handover code at the meetup. Returns 'ok',
-- 'wrong_code', or 'locked' (5 wrong tries) instead of raising, so the count of
-- wrong tries is saved.
create function app.order_handover(p_id uuid, p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
  s app.order_secrets;
begin
  o := app.order_lock_for(me, p_id);
  if me <> o.seller_id then
    raise exception using errcode = 'MK403', message = 'not_seller',
      hint = 'Only the seller enters the handover code.';
  end if;
  if o.fulfilment <> 'meetup' or o.status <> 'confirmed' then
    raise exception using errcode = 'MK409', message = 'cannot_hand_over',
      hint = 'This order isn''t waiting for a handover.';
  end if;
  select * into s from app.order_secrets where order_id = p_id for update;
  if s.attempts >= 5 then
    return 'locked';
  end if;
  if p_code is distinct from s.handover_code then
    update app.order_secrets set attempts = attempts + 1 where order_id = p_id;
    return case when s.attempts + 1 >= 5 then 'locked' else 'wrong_code' end;
  end if;
  perform app.order_set_completed(p_id);
  return 'ok';
end;
$$;

-- Buyer: a fresh code (after a leak or a lock).
create function app.order_new_handover_code(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
begin
  o := app.order_lock_for(me, p_id);
  if me <> o.buyer_id or o.fulfilment <> 'meetup' or o.status <> 'confirmed' then
    raise exception using errcode = 'MK409', message = 'cannot_change_code',
      hint = 'The code can''t be changed now.';
  end if;
  update app.order_secrets set handover_code = app.new_handover_code(), attempts = 0,
         created_at = now()
   where order_id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Integrations (role app_integrations only)
-- ---------------------------------------------------------------------------

-- A tracking update from MockCourier. Steps only move forward; "delivered" moves
-- the order on (online: 2-day window; COD: courier remits, order completes).
create function app.shipment_event(
  p_provider text, p_event text, p_tracking text, p_status app.shipment_status
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  sh app.shipments;
  o app.orders;
begin
  insert into app.provider_events (provider, event_id, kind)
  values (p_provider, p_event, 'shipment.' || p_status::text) on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;
  select * into sh from app.shipments where tracking_number = p_tracking;
  if not found then
    return 'ignored';
  end if;
  perform app.order_apply_timers(sh.order_id);
  select * into o from app.orders where id = sh.order_id for update;
  select * into sh from app.shipments where order_id = sh.order_id for update;
  if o.status <> 'shipped' or p_status <= sh.status then
    return 'ignored';
  end if;
  update app.shipments set status = p_status where order_id = sh.order_id;
  insert into app.shipment_events (order_id, status) values (sh.order_id, p_status);
  if p_status = 'delivered' then
    update app.orders set delivered_at = now() where id = o.id;
    if o.payment_method = 'cod' then
      perform app.order_set_completed(o.id);
      return 'completed';
    end if;
    update app.orders set status = 'delivered', confirm_by = now() + interval '2 days'
     where id = o.id;
    return 'delivered';
  end if;
  return 'updated';
end;
$$;

-- Test-mode tool: move the order's current deadline to now, so the next read
-- applies the timer. Runs as app_integrations with the caller's verified claims;
-- only a participant may use it. Returns the deadline moved, or 'none'.
create function app.demo_fast_forward(p_id uuid) returns text
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
    update app.orders set meet_by = past where id = p_id;
    return 'meet_by';
  elsif o.status = 'delivered' then
    update app.orders set confirm_by = past where id = p_id;
    return 'confirm_by';
  end if;
  return 'none';
end;
$$;

-- ---------------------------------------------------------------------------
-- Reviews (double-blind; TRANSACTIONS_DESIGN §9)
-- ---------------------------------------------------------------------------
create table app.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders (id) on delete cascade,
  reviewer_id uuid references app.profiles (id) on delete set null,
  reviewee_id uuid not null references app.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  constraint reviews_not_self check (reviewer_id <> reviewee_id)
);
create unique index reviews_one_per_side on app.reviews (order_id, reviewer_id);
create index reviews_reviewee_idx on app.reviews (reviewee_id, created_at desc);

-- Public once both sides reviewed, or 14 days after the order completed.
create function app.review_is_public(p_order uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from app.reviews where order_id = p_order) >= 2
      or coalesce((select completed_at + interval '14 days' < now()
                   from app.orders where id = p_order), false);
$$;

create function app.review_create(p_id uuid, p_rating smallint, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
  other uuid;
begin
  o := app.order_lock_for(me, p_id);
  other := case when me = o.buyer_id then o.seller_id else o.buyer_id end;
  if o.status <> 'completed' or o.completed_at < now() - interval '30 days' then
    raise exception using errcode = 'MK409', message = 'cannot_review',
      hint = 'Reviews are open for 30 days after an order completes.';
  end if;
  if other is null then
    raise exception using errcode = 'MK409', message = 'user_left',
      hint = 'The other person has deleted their account.';
  end if;
  if exists (select 1 from app.reviews where order_id = p_id and reviewer_id = me) then
    raise exception using errcode = 'MK409', message = 'already_reviewed',
      hint = 'You already reviewed this order.';
  end if;
  insert into app.reviews (order_id, reviewer_id, reviewee_id, rating, comment)
  values (p_id, me, other, p_rating, nullif(btrim(p_comment), ''));
end;
$$;

-- Average and count of public reviews about a user.
create function app.rating_summary(p_profile uuid)
returns table (average numeric, total bigint)
language sql stable security definer set search_path = '' as $$
  select round(avg(r.rating)::numeric, 1), count(*)
  from app.reviews r
  where r.reviewee_id = p_profile and app.review_is_public(r.order_id);
$$;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
revoke all on app.shipments, app.shipment_events, app.reviews
  from public, anon, authenticated, app_integrations;
revoke all on function
  app.ledger_cod_remit(app.orders), app.order_ship(uuid), app.order_confirm_received(uuid),
  app.order_handover(uuid, text), app.order_new_handover_code(uuid),
  app.shipment_event(text, text, text, app.shipment_status), app.demo_fast_forward(uuid),
  app.review_is_public(uuid), app.review_create(uuid, smallint, text), app.rating_summary(uuid)
  from public, anon, authenticated;

grant select on app.shipments, app.shipment_events to authenticated;
grant select on app.reviews to anon, authenticated;
grant execute on function
  app.order_ship(uuid), app.order_confirm_received(uuid), app.order_handover(uuid, text),
  app.order_new_handover_code(uuid), app.review_create(uuid, smallint, text)
  to authenticated;
grant execute on function app.review_is_public(uuid), app.rating_summary(uuid)
  to anon, authenticated;
grant execute on function
  app.shipment_event(text, text, text, app.shipment_status), app.demo_fast_forward(uuid)
  to app_integrations;

alter table app.shipments enable row level security;
alter table app.shipment_events enable row level security;
alter table app.reviews enable row level security;

create policy shipments_read_participant on app.shipments for select to authenticated
  using (exists (select 1 from app.orders o
                 where o.id = order_id and (select auth.uid()) in (o.buyer_id, o.seller_id)));
create policy shipment_events_read_participant on app.shipment_events for select to authenticated
  using (exists (select 1 from app.orders o
                 where o.id = order_id and (select auth.uid()) in (o.buyer_id, o.seller_id)));
create policy reviews_read_own on app.reviews for select to authenticated
  using (reviewer_id = (select auth.uid()));
create policy reviews_read_public on app.reviews for select to anon, authenticated
  using (app.review_is_public(order_id));

-- Public reviews about a user, with the order title (the orders table itself is
-- private to its two participants).
create function app.public_reviews(p_profile uuid)
returns table (rating smallint, comment text, created_at timestamptz, title text,
               by_buyer boolean, reviewer_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.rating, r.comment, r.created_at, o.title, r.reviewer_id = o.buyer_id, r.reviewer_id
  from app.reviews r join app.orders o on o.id = r.order_id
  where r.reviewee_id = p_profile and app.review_is_public(r.order_id);
$$;
revoke all on function app.public_reviews(uuid) from public, anon, authenticated;
grant execute on function app.public_reviews(uuid) to anon, authenticated;
