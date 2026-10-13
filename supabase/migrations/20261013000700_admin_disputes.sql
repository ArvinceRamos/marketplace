-- Phase 12: disputes (online orders), admin moderation, restricted users, audit log.
-- Design: docs/TRANSACTIONS_DESIGN.md §8 and §10; SECURITY_PLAN T30, T31.
--
-- Admin = `app_metadata.role = 'admin'` in the verified token. Users cannot edit
-- app_metadata; it is set only with SQL or the Auth admin API (npm run db:admin).
-- Every admin change runs in a definer function that checks app.is_admin() and
-- writes an admin_actions row in the same transaction.

-- ---------------------------------------------------------------------------
-- Roles and restrictions
-- ---------------------------------------------------------------------------
create function app.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- Public on purpose: other users see "This account is restricted" (like Carousell's
-- "under review" warning). Users can't change it (no column grant + guard below).
alter table app.profiles add column restricted_at timestamptz;

create function app.is_restricted(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select restricted_at is not null from app.profiles where id = uid), false);
$$;

create or replace function app.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at
     or new.age_confirmed_at is distinct from old.age_confirmed_at
     or (new.restricted_at is distinct from old.restricted_at
         and current_user in ('anon', 'authenticated')) then
    raise exception 'profile field is read-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Restricted users can't create listings, chats, messages, or offers (T31).
alter policy listings_insert_own on app.listings
  with check (seller_id = (select auth.uid()) and not app.is_restricted((select auth.uid())));
alter policy conversations_insert_as_buyer on app.conversations
  with check (buyer_id = (select auth.uid()) and not app.is_restricted((select auth.uid())));
alter policy messages_insert on app.messages
  with check (sender_id = (select auth.uid())
              and kind = 'text'
              and not app.is_restricted((select auth.uid()))
              and exists (select 1 from app.conversations c
                          where c.id = conversation_id
                            and (select auth.uid()) in (c.buyer_id, c.seller_id)));
alter policy offers_insert_as_buyer on app.offers
  with check (not app.is_restricted((select auth.uid()))
              and exists (select 1 from app.conversations c
                          where c.id = conversation_id and c.buyer_id = (select auth.uid())));

-- ... nor publish or resume a listing.
create function app.listings_restricted_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'active' and old.status <> 'active'
     and current_user in ('anon', 'authenticated') and app.is_restricted(new.seller_id) then
    raise exception 'your account is restricted' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger listings_restricted_guard before update of status on app.listings
  for each row execute function app.listings_restricted_guard();

-- ... nor buy. Same as Phase 10's order_terms plus the restriction check.
create or replace function app.order_terms(
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
  if app.is_restricted(me) then
    raise exception using errcode = 'MK403', message = 'restricted',
      hint = 'Your account is restricted by a moderator.';
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

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table app.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid references app.profiles (id) on delete set null,
  action text not null check (char_length(action) between 1 and 50),
  target_type text not null check (target_type in ('report', 'listing', 'user', 'dispute')),
  target_id uuid,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index admin_actions_recent_idx on app.admin_actions (id desc);

create function app.admin_log(p_action text, p_type text, p_target uuid, p_note text)
returns void
language sql security definer set search_path = '' as $$
  insert into app.admin_actions (admin_id, action, target_type, target_id, note)
  values ((select auth.uid()), p_action, p_type, p_target, nullif(btrim(p_note), ''));
$$;

create function app.require_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception using errcode = 'MK403', message = 'not_admin',
      hint = 'Only moderators can do that.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Disputes (online orders only; TRANSACTIONS_DESIGN §8)
-- ---------------------------------------------------------------------------
create type app.dispute_reason as enum ('not_received', 'not_as_described', 'incomplete');
create type app.dispute_status as enum ('open', 'escalated', 'resolved');

create table app.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references app.orders (id) on delete cascade,
  reason app.dispute_reason not null,
  details text check (char_length(details) <= 1000),
  status app.dispute_status not null default 'open',
  respond_by timestamptz,
  seller_note text check (char_length(seller_note) <= 1000),
  admin_note text check (char_length(admin_note) <= 500),
  outcome text check (outcome in ('refunded', 'released', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index disputes_queue_idx on app.disputes (status, created_at);
create trigger disputes_updated_at before update on app.disputes
  for each row execute function app.set_updated_at();

-- Full refund after a dispute. No return (TRANSACTIONS_DESIGN D9): the buyer keeps
-- the item, so the listing stays sold (the seller can "Undo sold" if it comes back).
create function app.order_set_refunded(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o app.orders;
begin
  select * into o from app.orders where id = p_id;
  perform app.ledger_refund(o, o.total_centavos, 'Refund (dispute): ' || o.title);
  update app.payments set status = 'refunded' where order_id = p_id and status = 'succeeded';
  update app.orders set status = 'refunded', refunded_at = now(), confirm_by = null
   where id = p_id;
  perform app.listing_mark_sold(o.listing_id);
end;
$$;

create function app.dispute_resolve(p_dispute uuid, p_outcome text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d app.disputes;
begin
  select * into d from app.disputes where id = p_dispute;
  if p_outcome = 'refunded' then
    perform app.order_set_refunded(d.order_id);
  else
    perform app.order_set_completed(d.order_id);  -- releases the money
  end if;
  update app.disputes set status = 'resolved', outcome = p_outcome, resolved_at = now(),
         respond_by = null
   where id = p_dispute;
end;
$$;

-- Timers: Phase 11's plus "seller didn't answer in 48 h → escalated".
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
  elsif o.status = 'disputed' then
    update app.disputes set status = 'escalated', respond_by = null
     where order_id = p_id and status = 'open' and respond_by < now();
  end if;
end;
$$;

-- The lists above only tick orders with a past deadline; include disputes too.
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
                                and d.status = 'open' and d.respond_by < now())) loop
    perform app.order_apply_timers(oid);
  end loop;
end;
$$;

create function app.dispute_open(p_id uuid, p_reason app.dispute_reason, p_details text)
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
             or (o.status = 'delivered' and p_reason <> 'not_received')) then
    raise exception using errcode = 'MK409', message = 'cannot_dispute',
      hint = 'You can''t report this problem for this order now.';
  end if;
  insert into app.disputes (order_id, reason, details, respond_by)
  values (p_id, p_reason, nullif(btrim(p_details), ''), now() + interval '48 hours');
  update app.orders set status = 'disputed', confirm_by = null where id = p_id;
end;
$$;

-- Lock the open/escalated dispute of an order the caller takes part in.
create function app.dispute_lock_for(me uuid, p_id uuid) returns app.disputes
language plpgsql security definer set search_path = '' as $$
declare
  d app.disputes;
begin
  perform app.order_lock_for(me, p_id);
  select * into d from app.disputes where order_id = p_id and status <> 'resolved' for update;
  if not found then
    raise exception using errcode = 'MK409', message = 'no_open_dispute',
      hint = 'There is no open problem report for this order.';
  end if;
  return d;
end;
$$;

-- Seller: refund in full, or contest (goes to a moderator).
create function app.dispute_seller_respond(p_id uuid, p_action text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  d app.disputes;
begin
  d := app.dispute_lock_for(me, p_id);
  if me <> (select seller_id from app.orders where id = p_id) then
    raise exception using errcode = 'MK403', message = 'not_seller',
      hint = 'Only the seller can answer this.';
  end if;
  if d.status <> 'open' then
    raise exception using errcode = 'MK409', message = 'dispute_escalated',
      hint = 'A moderator is already deciding this.';
  end if;
  update app.disputes set seller_note = nullif(btrim(p_note), '') where id = d.id;
  if p_action = 'refund' then
    perform app.dispute_resolve(d.id, 'refunded');
  elsif p_action = 'contest' then
    update app.disputes set status = 'escalated', respond_by = null where id = d.id;
  else
    raise exception using errcode = 'MK422', message = 'invalid_action',
      hint = 'Choose refund or contest.';
  end if;
end;
$$;

-- Buyer: the problem is solved; release the money.
create function app.dispute_withdraw(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  d app.disputes;
begin
  d := app.dispute_lock_for(me, p_id);
  if me <> (select buyer_id from app.orders where id = p_id) then
    raise exception using errcode = 'MK403', message = 'not_buyer',
      hint = 'Only the buyer can withdraw the report.';
  end if;
  perform app.dispute_resolve(d.id, 'withdrawn');
end;
$$;

-- Either side: ask a moderator now.
create function app.dispute_escalate(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d app.disputes;
begin
  d := app.dispute_lock_for((select auth.uid()), p_id);
  if d.status <> 'open' then
    raise exception using errcode = 'MK409', message = 'dispute_escalated',
      hint = 'A moderator is already deciding this.';
  end if;
  update app.disputes set status = 'escalated', respond_by = null where id = d.id;
end;
$$;

-- Test-mode fast-forward: Phase 11's plus the 48-hour seller answer.
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
    update app.orders set meet_by = past where id = p_id;
    return 'meet_by';
  elsif o.status = 'delivered' then
    update app.orders set confirm_by = past where id = p_id;
    return 'confirm_by';
  elsif o.status = 'disputed' then
    update app.disputes set respond_by = past where order_id = p_id and status = 'open';
    return case when found then 'respond_by' else 'none' end;
  end if;
  return 'none';
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------
create function app.admin_resolve_dispute(p_dispute uuid, p_outcome text, p_note text)
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

create function app.admin_set_report(p_report uuid, p_status app.report_status, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update app.reports set status = p_status where id = p_report;
  if not found then
    raise exception using errcode = 'MK404', message = 'report_not_found',
      hint = 'This report was not found.';
  end if;
  perform app.admin_log('report_' || p_status::text, 'report', p_report, p_note);
end;
$$;

create function app.admin_set_moderation(
  p_listing uuid, p_moderation app.moderation_status, p_note text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update app.listings set moderation = p_moderation where id = p_listing;
  if not found then
    raise exception using errcode = 'MK404', message = 'listing_not_found',
      hint = 'This listing was not found.';
  end if;
  perform app.admin_log(
    case when p_moderation = 'hidden' then 'listing_hidden' else 'listing_shown' end,
    'listing', p_listing, p_note);
end;
$$;

create function app.admin_set_restriction(p_profile uuid, p_restricted boolean, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_profile = (select auth.uid()) then
    raise exception using errcode = 'MK422', message = 'cannot_restrict_self',
      hint = 'You can''t restrict your own account.';
  end if;
  update app.profiles
     set restricted_at = case when p_restricted then coalesce(restricted_at, now()) end
   where id = p_profile;
  if not found then
    raise exception using errcode = 'MK404', message = 'user_not_found',
      hint = 'This user was not found.';
  end if;
  perform app.admin_log(
    case when p_restricted then 'user_restricted' else 'user_unrestricted' end,
    'user', p_profile, p_note);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
revoke all on app.disputes, app.admin_actions from public, anon, authenticated, app_integrations;
revoke all on function
  app.is_admin(), app.is_restricted(uuid), app.listings_restricted_guard(),
  app.admin_log(text, text, uuid, text), app.require_admin(), app.order_set_refunded(uuid),
  app.dispute_resolve(uuid, text), app.dispute_open(uuid, app.dispute_reason, text),
  app.dispute_lock_for(uuid, uuid), app.dispute_seller_respond(uuid, text, text),
  app.dispute_withdraw(uuid), app.dispute_escalate(uuid),
  app.admin_resolve_dispute(uuid, text, text),
  app.admin_set_report(uuid, app.report_status, text),
  app.admin_set_moderation(uuid, app.moderation_status, text),
  app.admin_set_restriction(uuid, boolean, text)
  from public, anon, authenticated;

grant select on app.disputes, app.admin_actions to authenticated;
-- Used inside RLS policies.
grant execute on function app.is_admin(), app.is_restricted(uuid) to anon, authenticated;
grant execute on function
  app.dispute_open(uuid, app.dispute_reason, text), app.dispute_seller_respond(uuid, text, text),
  app.dispute_withdraw(uuid), app.dispute_escalate(uuid),
  app.admin_resolve_dispute(uuid, text, text),
  app.admin_set_report(uuid, app.report_status, text),
  app.admin_set_moderation(uuid, app.moderation_status, text),
  app.admin_set_restriction(uuid, boolean, text)
  to authenticated;

alter table app.disputes enable row level security;
alter table app.admin_actions enable row level security;

create policy disputes_read_participant on app.disputes for select to authenticated
  using (exists (select 1 from app.orders o
                 where o.id = order_id and (select auth.uid()) in (o.buyer_id, o.seller_id)));

-- Moderators read everything they need to decide (no write policies: functions only).
create policy disputes_read_admin on app.disputes for select to authenticated
  using ((select app.is_admin()));
create policy admin_actions_read_admin on app.admin_actions for select to authenticated
  using ((select app.is_admin()));
create policy reports_read_admin on app.reports for select to authenticated
  using ((select app.is_admin()));
create policy listings_read_admin on app.listings for select to authenticated
  using ((select app.is_admin()));
create policy orders_read_admin on app.orders for select to authenticated
  using ((select app.is_admin()));
create policy payments_read_admin on app.payments for select to authenticated
  using ((select app.is_admin()));
create policy ledger_read_admin on app.ledger_entries for select to authenticated
  using ((select app.is_admin()));
create policy shipments_read_admin on app.shipments for select to authenticated
  using ((select app.is_admin()));

-- Moderators apply due timers too (e.g. a dispute whose 48 hours ran out moves to
-- the escalated queue when the queue is opened).
create function app.order_apply_timers_admin(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  perform app.order_apply_timers(p_id);
end;
$$;
revoke all on function app.order_apply_timers_admin(uuid) from public, anon, authenticated;
grant execute on function app.order_apply_timers_admin(uuid) to authenticated;
