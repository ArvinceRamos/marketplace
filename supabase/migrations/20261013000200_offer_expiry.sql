-- Phase 5: expire stale offers lazily (no cron on the free plan).
-- Offers expire 7 days after they are made. Nothing runs in the background, so
-- the API calls this before reading or changing a conversation's offers.
--
-- Security definer because end users may not set an offer to 'expired'
-- (offers_guard only lets internal updates do that). It only touches offers that
-- are already past expires_at, and only in a conversation the caller is part of.

create function app.expire_stale_offers(conv uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not exists (select 1 from app.conversations c
                 where c.id = conv and (select auth.uid()) in (c.buyer_id, c.seller_id)) then
    return 0;
  end if;
  update app.offers set status = 'expired'
   where conversation_id = conv and status = 'pending' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function app.expire_stale_offers(uuid) from public, anon;
grant execute on function app.expire_stale_offers(uuid) to authenticated;

-- Fix: the "other user has left" rule must only stop typed messages. Automatic
-- offer notes (e.g. "Offer expired" when the seller marks the item sold) must
-- still be written after the buyer deleted their account, or the status change fails.
create or replace function app.messages_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  select buyer_id, seller_id into c from app.conversations where id = new.conversation_id;
  if new.kind = 'text' then
    if c.buyer_id is null or c.seller_id is null then
      raise exception 'the other user has left' using errcode = '23514';
    end if;
    if app.is_blocked_between(c.buyer_id, c.seller_id) then
      raise exception 'blocked' using errcode = '42501';
    end if;
  end if;
  new.created_at := now();
  return new;
end;
$$;
