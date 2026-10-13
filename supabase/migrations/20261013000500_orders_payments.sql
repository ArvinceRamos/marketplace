-- Phase 10: simulated payments core. Design: docs/TRANSACTIONS_DESIGN.md.
--
-- TEST MODE ONLY: no real money moves. Payments come from the built-in MockPay.
--
-- Pattern (TRANSACTIONS_DESIGN D6): users get SELECT only (under RLS) on the new
-- tables. Every change goes through a `security definer` function that checks
-- auth.uid(), locks the rows it changes, and checks the state.
--
-- Errors meant for users are raised with SQLSTATE 'MKnnn' (nnn = HTTP status),
-- MESSAGE = an error code and HINT = plain-language text. The API maps them as is.

-- ---------------------------------------------------------------------------
-- Listings: 'reserved' is set and cleared only by order functions
-- ---------------------------------------------------------------------------
create or replace function app.listings_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  internal boolean := current_user not in ('anon', 'authenticated');
begin
  if exists (select 1 from app.categories c where c.parent_id = new.category_id) then
    raise exception 'listing must use a subcategory' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'new listings start as draft' using errcode = '23514';
    end if;
    new.published_at := null;
    new.sold_at := null;
    new.deleted_at := null;
    new.moderation := 'ok';
    return new;
  end if;

  if new.id <> old.id or new.seller_id <> old.seller_id or new.created_at <> old.created_at then
    raise exception 'listing field is read-only' using errcode = '42501';
  end if;
  if new.moderation <> old.moderation and not internal then
    raise exception 'moderation is admin-only' using errcode = '42501';
  end if;
  if old.status = 'deleted' then
    raise exception 'deleted listings cannot change' using errcode = '23514';
  end if;

  if new.status <> old.status then
    if (old.status = 'reserved' or new.status = 'reserved') and not internal then
      raise exception 'this item is reserved for an order' using errcode = '23514';
    end if;
    if not (
      (old.status = 'draft'    and new.status in ('active', 'deleted')) or
      (old.status = 'active'   and new.status in ('paused', 'sold', 'deleted', 'reserved')) or
      (old.status = 'paused'   and new.status in ('active', 'sold', 'deleted')) or
      (old.status = 'sold'     and new.status in ('paused', 'deleted')) or
      (old.status = 'reserved' and new.status in ('active', 'sold'))
    ) then
      raise exception 'illegal status change % -> %', old.status, new.status
        using errcode = '23514';
    end if;

    if new.status = 'active' then
      if not exists (select 1 from app.listing_images i where i.listing_id = new.id) then
        raise exception 'publishing needs at least one photo' using errcode = '23514';
      end if;
      new.published_at := coalesce(old.published_at, now());
    end if;
    new.sold_at := case when new.status = 'sold' then now() end;
    if new.status = 'deleted' then
      new.deleted_at := now();
    end if;
  else
    new.published_at := old.published_at;
    new.sold_at := old.sold_at;
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end;
$$;

-- Reserved listings stay visible (with a "Reserved" label) and can be saved.
alter policy listings_read_public on app.listings
  using (status in ('active', 'paused', 'sold', 'reserved') and moderation = 'ok');
alter policy favorites_insert_own on app.favorites
  with check (user_id = (select auth.uid())
              and exists (select 1 from app.listings l
                          where l.id = listing_id
                            and l.status in ('active', 'paused', 'sold', 'reserved')
                            and l.moderation = 'ok'));

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type app.order_status as enum (
  'pending_payment', 'confirmed', 'shipped', 'delivered',
  'completed', 'cancelled', 'disputed', 'refunded'
);
create type app.order_fulfilment as enum ('meetup', 'delivery');
create type app.order_payment as enum ('online', 'cash', 'cod');
create type app.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type app.ledger_account as enum ('external', 'escrow', 'seller', 'courier', 'platform');

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table app.orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references app.listings (id) on delete set null,
  buyer_id uuid references app.profiles (id) on delete set null,
  seller_id uuid references app.profiles (id) on delete set null,
  offer_id uuid references app.offers (id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  cover_path text check (char_length(cover_path) <= 300),
  fulfilment app.order_fulfilment not null,
  payment_method app.order_payment not null,
  courier text check (courier in ('jnt', 'flash', 'lbc', 'lalamove', 'grab')),
  item_price_centavos bigint not null check (item_price_centavos >= 0),
  shipping_fee_centavos bigint not null check (shipping_fee_centavos >= 0),
  buyer_fee_centavos bigint not null check (buyer_fee_centavos >= 0),
  total_centavos bigint not null,
  status app.order_status not null,
  cancel_reason text
    check (cancel_reason in ('buyer', 'seller', 'payment_expired', 'not_shipped', 'not_met')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  payment_due_at timestamptz,
  ship_by timestamptz,
  meet_by timestamptz,
  confirm_by timestamptz,
  constraint orders_total check (
    total_centavos = item_price_centavos + shipping_fee_centavos + buyer_fee_centavos
  ),
  constraint orders_courier check ((fulfilment = 'delivery') = (courier is not null)),
  constraint orders_cash_meetup check (payment_method <> 'cash' or fulfilment = 'meetup'),
  constraint orders_cod_delivery check (payment_method <> 'cod' or fulfilment = 'delivery'),
  constraint orders_fee_online check (payment_method = 'online' or buyer_fee_centavos = 0)
);
-- One open order per listing (second wall behind the listing row lock).
create unique index orders_one_open_per_listing on app.orders (listing_id)
  where status in ('pending_payment', 'confirmed', 'shipped', 'delivered', 'disputed');
create index orders_buyer_idx on app.orders (buyer_id, created_at desc);
create index orders_seller_idx on app.orders (seller_id, created_at desc);
create index orders_status_idx on app.orders (status);
create trigger orders_updated_at before update on app.orders
  for each row execute function app.set_updated_at();

-- Open = money or an item may still move.
create function app.order_is_open(s app.order_status) returns boolean
language sql immutable set search_path = '' as $$
  select s in ('pending_payment', 'confirmed', 'shipped', 'delivered', 'disputed');
$$;

-- Meetup handover code. A separate table so only the buyer can read it (RLS).
create table app.order_secrets (
  order_id uuid primary key references app.orders (id) on delete cascade,
  handover_code text not null check (handover_code ~ '^[0-9]{6}$'),
  attempts smallint not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Payments (simulated provider sessions) and processed webhook events
-- ---------------------------------------------------------------------------
create table app.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.orders (id) on delete cascade,
  provider text not null check (provider in ('mock')),
  provider_ref text not null unique check (char_length(provider_ref) between 8 and 100),
  amount_centavos bigint not null check (amount_centavos > 0),
  status app.payment_status not null default 'pending',
  failure_reason text check (char_length(failure_reason) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on app.payments (order_id, created_at desc);
create trigger payments_updated_at before update on app.payments
  for each row execute function app.set_updated_at();

-- A row per webhook event already handled. The primary key makes handling idempotent.
create table app.provider_events (
  provider text not null,
  event_id text not null check (char_length(event_id) between 1 and 100),
  kind text not null check (char_length(kind) <= 50),
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- Ledger: append-only, double entry (every txn_id sums to zero)
-- ---------------------------------------------------------------------------
create table app.ledger_entries (
  id bigint generated always as identity primary key,
  txn_id uuid not null,
  order_id uuid references app.orders (id) on delete set null,
  account app.ledger_account not null,
  -- seller/external rows name their user (null only after that user is deleted).
  user_id uuid references app.profiles (id) on delete set null,
  amount_centavos bigint not null check (amount_centavos <> 0),
  memo text not null check (char_length(memo) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint ledger_platform_accounts check (
    account in ('seller', 'external') or user_id is null
  )
);
create index ledger_user_idx on app.ledger_entries (user_id, id desc);
create index ledger_txn_idx on app.ledger_entries (txn_id);
create index ledger_order_idx on app.ledger_entries (order_id);

-- Definer: checks the whole transaction, including rows the caller can't see.
create function app.ledger_txn_balanced() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select coalesce(sum(amount_centavos), 0) from app.ledger_entries
      where txn_id = new.txn_id) <> 0 then
    raise exception 'ledger transaction % does not balance', new.txn_id using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger ledger_balanced after insert on app.ledger_entries
  deferrable initially deferred
  for each row execute function app.ledger_txn_balanced();

-- Rows never change. The only update allowed is a foreign key setting a deleted
-- user or order to null.
create function app.ledger_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     or new.id <> old.id or new.txn_id <> old.txn_id or new.account <> old.account
     or new.amount_centavos <> old.amount_centavos or new.memo <> old.memo
     or new.created_at <> old.created_at
     or (new.user_id is distinct from old.user_id and new.user_id is not null)
     or (new.order_id is distinct from old.order_id and new.order_id is not null) then
    raise exception 'ledger entries cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger ledger_append_only before update or delete on app.ledger_entries
  for each row execute function app.ledger_append_only();

-- ---------------------------------------------------------------------------
-- Prices (TRANSACTIONS_DESIGN §3). Demo numbers, not real rates.
-- ---------------------------------------------------------------------------
create function app.buyer_fee(item bigint) returns bigint
language sql immutable set search_path = '' as $$
  select 1500 + round(item * 5 / 100.0)::bigint;  -- ₱15 + 5%, half up to the centavo
$$;

create function app.shipping_fee(courier text) returns bigint
language sql immutable set search_path = '' as $$
  select case courier
    when 'jnt' then 12000 when 'flash' then 11000 when 'lbc' then 18000
    when 'lalamove' then 25000 when 'grab' then 25000 end::bigint;
$$;

-- 6 random digits from a cryptographic source.
create function app.new_handover_code() returns text
language sql volatile set search_path = '' as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint)
               % 1000000)::text, 6, '0');
$$;

-- ---------------------------------------------------------------------------
-- Internal helpers (not granted to anyone; called by the functions below)
-- ---------------------------------------------------------------------------

-- Price and checks for buying a listing. Raises MKnnn errors.
create function app.order_terms(
  me uuid, p_listing uuid, p_offer uuid,
  p_fulfilment app.order_fulfilment, p_payment app.order_payment, p_courier text
) returns table (
  seller_id uuid, title text, cover_path text,
  item bigint, shipping bigint, fee bigint, total bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  l record;
  o record;
  v_item bigint;
  v_ship bigint := 0;
  v_fee bigint := 0;
begin
  if me is null then
    raise exception using errcode = 'MK401', message = 'not_authenticated',
      hint = 'Sign in to continue.';
  end if;
  select li.* into l from app.listings li
   where li.id = p_listing and li.moderation = 'ok'
     and li.status in ('active', 'paused', 'sold', 'reserved');
  if not found then
    raise exception using errcode = 'MK404', message = 'listing_not_found',
      hint = 'This listing is not available.';
  end if;
  if l.seller_id = me then
    raise exception using errcode = 'MK409', message = 'own_listing',
      hint = 'This is your own listing.';
  end if;
  if l.status <> 'active' then
    raise exception using errcode = 'MK409', message = 'listing_unavailable',
      hint = 'This item is no longer available.';
  end if;
  if app.is_blocked_between(me, l.seller_id) then
    raise exception using errcode = 'MK403', message = 'blocked',
      hint = 'You can''t buy from this user.';
  end if;

  if (p_fulfilment = 'meetup' and not l.meetup) or (p_fulfilment = 'delivery' and not l.delivery)
     or (p_payment = 'cash' and (p_fulfilment <> 'meetup' or not 'cash' = any (l.payment_methods)))
     or (p_payment = 'cod' and (p_fulfilment <> 'delivery' or not 'cod' = any (l.payment_methods)))
  then
    raise exception using errcode = 'MK409', message = 'option_unavailable',
      hint = 'The seller doesn''t offer this way of dealing.';
  end if;
  if p_fulfilment = 'delivery' then
    if p_courier is null or p_courier not in ('jnt', 'flash', 'lbc', 'lalamove', 'grab') then
      raise exception using errcode = 'MK422', message = 'courier_required',
        hint = 'Pick a courier for delivery.';
    end if;
    if cardinality(l.couriers) > 0 and not p_courier = any (l.couriers) then
      raise exception using errcode = 'MK409', message = 'option_unavailable',
        hint = 'The seller doesn''t ship with this courier.';
    end if;
    v_ship := app.shipping_fee(p_courier);
  elsif p_courier is not null then
    raise exception using errcode = 'MK422', message = 'courier_not_allowed',
      hint = 'Meetups don''t use a courier.';
  end if;

  v_item := l.price_centavos;
  if p_offer is not null then
    select ofr.amount_centavos into o from app.offers ofr
     where ofr.id = p_offer and ofr.listing_id = p_listing and ofr.buyer_id = me
       and ofr.status = 'accepted';
    if not found then
      raise exception using errcode = 'MK409', message = 'offer_not_usable',
        hint = 'That offer can''t be used for this order.';
    end if;
    v_item := o.amount_centavos;
  end if;
  if p_payment = 'online' then
    v_fee := app.buyer_fee(v_item);
  end if;

  return query select l.seller_id, l.title,
    (select i.thumb_path from app.listing_images i where i.listing_id = l.id
      order by i.position limit 1),
    v_item, v_ship, v_fee, v_item + v_ship + v_fee;
end;
$$;

-- Ledger helpers. Each call is one balanced transaction.
create function app.ledger_capture(o app.orders, amount bigint, memo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  txn uuid := gen_random_uuid();
begin
  insert into app.ledger_entries (txn_id, order_id, account, user_id, amount_centavos, memo)
  values (txn, o.id, 'external', o.buyer_id, -amount, memo),
         (txn, o.id, 'escrow', null, amount, memo);
end;
$$;

create function app.ledger_refund(o app.orders, amount bigint, memo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  txn uuid := gen_random_uuid();
begin
  insert into app.ledger_entries (txn_id, order_id, account, user_id, amount_centavos, memo)
  values (txn, o.id, 'escrow', null, -amount, memo),
         (txn, o.id, 'external', o.buyer_id, amount, memo);
end;
$$;

-- Escrow → seller (item), courier (shipping), platform (fee). Zero lines are skipped.
create function app.ledger_release(o app.orders) returns void
language plpgsql security definer set search_path = '' as $$
declare
  txn uuid := gen_random_uuid();
begin
  insert into app.ledger_entries (txn_id, order_id, account, user_id, amount_centavos, memo)
  select txn, o.id, a, u, amt, m from (values
    ('escrow'::app.ledger_account, null::uuid, -o.total_centavos, 'Released from escrow'),
    ('seller', o.seller_id, o.item_price_centavos, 'Sale: ' || o.title),
    ('courier', null, o.shipping_fee_centavos, 'Shipping fee'),
    ('platform', null, o.buyer_fee_centavos, 'Buyer protection fee')
  ) as v(a, u, amt, m)
  where amt <> 0;
end;
$$;

-- Listing side effects.
create function app.listing_release(p_listing uuid) returns void
language sql security definer set search_path = '' as $$
  update app.listings set status = 'active' where id = p_listing and status = 'reserved';
$$;
create function app.listing_mark_sold(p_listing uuid) returns void
language sql security definer set search_path = '' as $$
  update app.listings set status = 'sold' where id = p_listing and status = 'reserved';
$$;

-- Order transitions. The caller has locked the order row.
create function app.order_set_confirmed(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update app.orders set
    status = 'confirmed',
    paid_at = case when payment_method = 'online' then now() end,
    payment_due_at = null,
    ship_by = case when fulfilment = 'delivery' then now() + interval '5 days' end,
    meet_by = case when fulfilment = 'meetup' then now() + interval '7 days' end
  where id = p_id;
end;
$$;

create function app.order_set_completed(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o app.orders;
begin
  select * into o from app.orders where id = p_id;
  if o.payment_method = 'online' then
    perform app.ledger_release(o);
  end if;
  update app.orders set status = 'completed', completed_at = now(), confirm_by = null
   where id = p_id;
  perform app.listing_mark_sold(o.listing_id);
end;
$$;

create function app.order_set_cancelled(p_id uuid, reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o app.orders;
begin
  select * into o from app.orders where id = p_id;
  if o.payment_method = 'online' and o.paid_at is not null then
    perform app.ledger_refund(o, o.total_centavos, 'Refund: ' || o.title);
    update app.payments set status = 'refunded' where order_id = p_id and status = 'succeeded';
  end if;
  update app.orders set status = 'cancelled', cancel_reason = reason, cancelled_at = now(),
         refunded_at = case when o.paid_at is not null then now() end,
         payment_due_at = null, ship_by = null, meet_by = null, confirm_by = null
   where id = p_id;
  update app.payments set status = 'failed', failure_reason = 'order_cancelled'
   where order_id = p_id and status = 'pending';
  perform app.listing_release(o.listing_id);
end;
$$;

-- Apply any timer that is due (TRANSACTIONS_DESIGN §4). Locks the order.
-- Later phases replace this to add more timers.
create function app.order_apply_timers(p_id uuid) returns void
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
  end if;
end;
$$;

-- Lock an order the caller takes part in, after applying due timers.
create function app.order_lock_for(me uuid, p_id uuid) returns app.orders
language plpgsql security definer set search_path = '' as $$
declare
  o app.orders;
begin
  if not exists (select 1 from app.orders where id = p_id and me in (buyer_id, seller_id)) then
    raise exception using errcode = 'MK404', message = 'order_not_found',
      hint = 'This order was not found.';
  end if;
  perform app.order_apply_timers(p_id);
  select * into o from app.orders where id = p_id for update;
  return o;
end;
$$;

-- ---------------------------------------------------------------------------
-- Functions the API calls as the signed-in user
-- ---------------------------------------------------------------------------

-- Amounts for a possible order. Nothing is saved.
create function app.order_quote(
  p_listing uuid, p_offer uuid, p_fulfilment app.order_fulfilment,
  p_payment app.order_payment, p_courier text
) returns table (item bigint, shipping bigint, fee bigint, total bigint)
language sql stable security definer set search_path = '' as $$
  select t.item, t.shipping, t.fee, t.total
  from app.order_terms((select auth.uid()), p_listing, p_offer, p_fulfilment, p_payment,
                       p_courier) t;
$$;

create function app.order_create(
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

  insert into app.orders (
    listing_id, buyer_id, seller_id, offer_id, title, cover_path, fulfilment, payment_method,
    courier, item_price_centavos, shipping_fee_centavos, buyer_fee_centavos, total_centavos,
    status, payment_due_at
  ) values (
    p_listing, me, t.seller_id, p_offer, t.title, t.cover_path, p_fulfilment, p_payment,
    p_courier, t.item, t.shipping, t.fee, t.total,
    'pending_payment', now() + interval '30 minutes'
  ) returning id into new_id;

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

-- Apply due timers to one of my orders (before reading it).
create function app.order_tick(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from app.orders
             where id = p_id and (select auth.uid()) in (buyer_id, seller_id)) then
    perform app.order_apply_timers(p_id);
  end if;
end;
$$;

-- Apply due timers to all of my open orders (before listing them).
create function app.orders_tick_mine() returns void
language plpgsql security definer set search_path = '' as $$
declare
  oid uuid;
begin
  for oid in select id from app.orders
              where (select auth.uid()) in (buyer_id, seller_id) and app.order_is_open(status)
                and least(payment_due_at, ship_by, meet_by, confirm_by) < now() loop
    perform app.order_apply_timers(oid);
  end loop;
end;
$$;

-- Apply due timers on a listing's open order, so an abandoned checkout frees the
-- listing when anyone looks at it. Only ever moves an order along its own timers.
create function app.listing_tick(p_listing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  oid uuid;
begin
  for oid in select id from app.orders
              where listing_id = p_listing and app.order_is_open(status)
                and least(payment_due_at, ship_by, meet_by, confirm_by) < now() loop
    perform app.order_apply_timers(oid);
  end loop;
end;
$$;

create function app.order_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
begin
  o := app.order_lock_for(me, p_id);
  if (me = o.buyer_id and o.status in ('pending_payment', 'confirmed'))
     or (me = o.seller_id and o.status = 'confirmed') then
    perform app.order_set_cancelled(p_id, case when me = o.buyer_id then 'buyer' else 'seller' end);
  else
    raise exception using errcode = 'MK409', message = 'cannot_cancel',
      hint = 'This order can''t be cancelled now.';
  end if;
end;
$$;

-- Record a new payment session for my unpaid order. The amount is the order total.
create function app.payment_start(p_id uuid, p_provider text, p_ref text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  o app.orders;
begin
  o := app.order_lock_for(me, p_id);
  if me <> o.buyer_id then
    raise exception using errcode = 'MK403', message = 'not_buyer',
      hint = 'Only the buyer can pay.';
  end if;
  if o.status <> 'pending_payment' or o.payment_method <> 'online' then
    raise exception using errcode = 'MK409', message = 'not_payable',
      hint = 'This order doesn''t need a payment now.';
  end if;
  insert into app.payments (order_id, provider, provider_ref, amount_centavos)
  values (p_id, p_provider, p_ref, o.total_centavos);
  return o.total_centavos;
end;
$$;

-- Withdraw from my wallet to "Demo bank" (no real payout, no account details).
create function app.wallet_withdraw(p_amount bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  balance bigint;
  txn uuid := gen_random_uuid();
begin
  if me is null then
    raise exception using errcode = 'MK401', message = 'not_authenticated',
      hint = 'Sign in to continue.';
  end if;
  if p_amount < 10000 then
    raise exception using errcode = 'MK422', message = 'amount_too_small',
      hint = 'The minimum withdrawal is ₱100.';
  end if;
  -- One withdrawal at a time per user, so two can't overdraw the balance.
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || me::text, 0));
  select coalesce(sum(amount_centavos), 0) into balance from app.ledger_entries
   where account = 'seller' and user_id = me;
  if p_amount > balance then
    raise exception using errcode = 'MK409', message = 'insufficient_balance',
      hint = 'That is more than your available balance.';
  end if;
  insert into app.ledger_entries (txn_id, account, user_id, amount_centavos, memo)
  values (txn, 'seller', me, -p_amount, 'Withdrawal to Demo bank'),
         (txn, 'external', me, p_amount, 'Withdrawal to Demo bank');
  return balance - p_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- Functions for webhooks (role app_integrations only)
-- ---------------------------------------------------------------------------
create function app.payment_succeeded(
  p_provider text, p_event text, p_ref text, p_amount bigint
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p app.payments;
  o app.orders;
begin
  insert into app.provider_events (provider, event_id, kind)
  values (p_provider, p_event, 'payment.succeeded') on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;
  select * into p from app.payments
   where provider = p_provider and provider_ref = p_ref for update;
  if not found or p.status <> 'pending' then
    return 'ignored';
  end if;
  if p_amount <> p.amount_centavos then
    update app.payments set status = 'failed', failure_reason = 'amount_mismatch'
     where id = p.id;
    return 'amount_mismatch';
  end if;

  perform app.order_apply_timers(p.order_id);
  select * into o from app.orders where id = p.order_id for update;
  perform app.ledger_capture(o, p.amount_centavos, 'Payment: ' || o.title);
  if o.status = 'pending_payment' then
    update app.payments set status = 'succeeded' where id = p.id;
    perform app.order_set_confirmed(o.id);
    return 'confirmed';
  end if;
  -- Paid too late (order cancelled or already paid): refund at once.
  perform app.ledger_refund(o, p.amount_centavos, 'Refund (late payment): ' || o.title);
  update app.payments set status = 'refunded', failure_reason = 'late_payment' where id = p.id;
  return 'refunded';
end;
$$;

create function app.payment_failed(p_provider text, p_event text, p_ref text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  insert into app.provider_events (provider, event_id, kind)
  values (p_provider, p_event, 'payment.failed') on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;
  update app.payments set status = 'failed', failure_reason = 'declined'
   where provider = p_provider and provider_ref = p_ref and status = 'pending';
  return case when found then 'failed' else 'ignored' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion: refused with open orders or a wallet balance (second wall)
-- ---------------------------------------------------------------------------
create function app.profiles_delete_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from app.orders
             where old.id in (buyer_id, seller_id) and app.order_is_open(status)) then
    raise exception using errcode = 'MK409', message = 'open_orders',
      hint = 'Finish or cancel your open orders first.';
  end if;
  if (select coalesce(sum(amount_centavos), 0) from app.ledger_entries
      where account = 'seller' and user_id = old.id) > 0 then
    raise exception using errcode = 'MK409', message = 'wallet_balance',
      hint = 'Withdraw your wallet balance first.';
  end if;
  return old;
end;
$$;
create trigger profiles_delete_guard before delete on app.profiles
  for each row execute function app.profiles_delete_guard();

-- ---------------------------------------------------------------------------
-- Role for webhooks (TRANSACTIONS_DESIGN D7)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_integrations') then
    create role app_integrations nologin noinherit nobypassrls;
  end if;
end;
$$;
grant app_integrations to api_app with inherit false, set true;
grant usage on schema app to app_integrations;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
revoke all on app.orders, app.order_secrets, app.payments, app.provider_events,
  app.ledger_entries from public, anon, authenticated, app_integrations;
revoke all on function
  app.order_is_open(app.order_status), app.ledger_txn_balanced(), app.ledger_append_only(),
  app.buyer_fee(bigint), app.shipping_fee(text), app.new_handover_code(),
  app.order_terms(uuid, uuid, uuid, app.order_fulfilment, app.order_payment, text),
  app.ledger_capture(app.orders, bigint, text), app.ledger_refund(app.orders, bigint, text),
  app.ledger_release(app.orders), app.listing_release(uuid), app.listing_mark_sold(uuid),
  app.order_set_confirmed(uuid), app.order_set_completed(uuid),
  app.order_set_cancelled(uuid, text), app.order_apply_timers(uuid),
  app.order_lock_for(uuid, uuid),
  app.order_quote(uuid, uuid, app.order_fulfilment, app.order_payment, text),
  app.order_create(uuid, uuid, app.order_fulfilment, app.order_payment, text),
  app.order_tick(uuid), app.orders_tick_mine(), app.listing_tick(uuid), app.order_cancel(uuid),
  app.payment_start(uuid, text, text), app.wallet_withdraw(bigint),
  app.payment_succeeded(text, text, text, bigint), app.payment_failed(text, text, text),
  app.profiles_delete_guard()
  from public, anon, authenticated;

grant select on app.orders, app.order_secrets, app.payments, app.ledger_entries
  to authenticated;
-- Used inside RLS policies and list queries.
grant execute on function app.order_is_open(app.order_status), app.shipping_fee(text)
  to authenticated;
grant execute on function
  app.order_quote(uuid, uuid, app.order_fulfilment, app.order_payment, text),
  app.order_create(uuid, uuid, app.order_fulfilment, app.order_payment, text),
  app.order_tick(uuid), app.orders_tick_mine(), app.order_cancel(uuid),
  app.payment_start(uuid, text, text), app.wallet_withdraw(bigint)
  to authenticated;
grant execute on function app.listing_tick(uuid) to anon, authenticated;
grant execute on function
  app.payment_succeeded(text, text, text, bigint), app.payment_failed(text, text, text)
  to app_integrations;

alter table app.orders enable row level security;
alter table app.order_secrets enable row level security;
alter table app.payments enable row level security;
alter table app.provider_events enable row level security;  -- no policies: definer only
alter table app.ledger_entries enable row level security;

create policy orders_read_participant on app.orders for select to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id));
create policy order_secrets_read_buyer on app.order_secrets for select to authenticated
  using (exists (select 1 from app.orders o
                 where o.id = order_id and o.buyer_id = (select auth.uid())));
create policy payments_read_participant on app.payments for select to authenticated
  using (exists (select 1 from app.orders o
                 where o.id = order_id and (select auth.uid()) in (o.buyer_id, o.seller_id)));
create policy ledger_read_own on app.ledger_entries for select to authenticated
  using (user_id = (select auth.uid()));
