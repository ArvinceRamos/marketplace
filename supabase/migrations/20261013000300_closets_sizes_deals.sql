-- Phase 7: sizes, deal options, and following sellers.
-- See docs/DATABASE_SCHEMA.md and docs/SECURITY_PLAN.md. Same pattern as before:
-- grant only what is needed, RLS on every new table, guard triggers for the rules.

-- ---------------------------------------------------------------------------
-- Sizes
-- ---------------------------------------------------------------------------
-- Which size list a (leaf) category uses. Null = no sizes (phones, furniture, ...).
alter table app.categories
  add column size_group text check (size_group in ('clothing', 'shoes', 'kids'));

-- Fixed size lists. Reference data, read-only for everyone.
create table app.size_options (
  size_group text not null check (size_group in ('clothing', 'shoes', 'kids')),
  value text not null check (char_length(value) between 1 and 20),
  sort_order smallint not null,
  primary key (size_group, value)
);

insert into app.size_options (size_group, value, sort_order)
select 'clothing', v, n from unnest(array[
  'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Free size'
]) with ordinality as t(v, n);

insert into app.size_options (size_group, value, sort_order)
select 'shoes', 'EU ' || s, s - 34 from generate_series(35, 47) as s;

insert into app.size_options (size_group, value, sort_order)
select 'kids', v, n from unnest(array[
  '0-6 months', '6-12 months', '1-2 years', '3-4 years', '5-6 years',
  '7-8 years', '9-10 years', '11-12 years', '13-14 years'
]) with ordinality as t(v, n);

alter table app.listings add column size text check (char_length(size) <= 20);
create index listings_size_idx on app.listings (category_id, size) where size is not null;

-- A size must be on its category's list; categories without a list take no size.
create function app.listings_size_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.size is not null and not exists (
    select 1 from app.categories c
    join app.size_options o on o.size_group = c.size_group
    where c.id = new.category_id and o.value = new.size
  ) then
    raise exception 'size does not fit this category' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger listings_size_check before insert or update of size, category_id on app.listings
  for each row execute function app.listings_size_check();

-- ---------------------------------------------------------------------------
-- Deal options (labels only: payments and couriers stay outside the app)
-- ---------------------------------------------------------------------------
create function app.array_is_distinct(arr text[]) returns boolean
language sql immutable set search_path = '' as $$
  select count(*) = count(distinct x) from unnest(arr) as x;
$$;

alter table app.listings
  add column payment_methods text[] not null default '{}',
  add column couriers text[] not null default '{}',
  add constraint listings_payment_methods check (
    payment_methods <@ array['gcash', 'maya', 'bank_transfer', 'cash', 'cod']
    and app.array_is_distinct(payment_methods)
  ),
  add constraint listings_couriers check (
    couriers <@ array['jnt', 'flash', 'lbc', 'lalamove', 'grab']
    and app.array_is_distinct(couriers)
  ),
  -- Couriers and cash on delivery need delivery; cash in hand needs a meetup.
  add constraint listings_couriers_need_delivery check (delivery or cardinality(couriers) = 0),
  add constraint listings_cod_needs_delivery check (delivery or not ('cod' = any (payment_methods))),
  add constraint listings_cash_needs_meetup check (meetup or not ('cash' = any (payment_methods)));

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------
create table app.follows (
  follower_id uuid not null references app.profiles (id) on delete cascade,
  followed_id uuid not null references app.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint follows_not_self check (follower_id <> followed_id)
);
create index follows_followed_idx on app.follows (followed_id);

-- Max 1,000 follows per person, and no following across a block (either side).
create function app.follows_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.is_blocked_between(new.follower_id, new.followed_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  if (select count(*) from app.follows where follower_id = new.follower_id) >= 1000 then
    raise exception 'too many follows' using errcode = '23514';
  end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger follows_guard before insert on app.follows
  for each row execute function app.follows_guard();

-- Blocking someone ends follows both ways. Definer: the blocker can't see or
-- delete the other person's follow row under RLS.
create function app.blocks_end_follows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from app.follows
  where (follower_id = new.blocker_id and followed_id = new.blocked_id)
     or (follower_id = new.blocked_id and followed_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_end_follows after insert on app.blocked_users
  for each row execute function app.blocks_end_follows();

-- Who follows whom is private (only your own list is readable), but the number of
-- followers is public. Definer, so it can count rows the caller cannot see.
create function app.follower_count(profile uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from app.follows where followed_id = profile;
$$;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
revoke all on app.size_options, app.follows from public, anon, authenticated;
revoke all on function app.listings_size_check(), app.array_is_distinct(text[]),
  app.follows_guard(), app.blocks_end_follows(), app.follower_count(uuid)
  from public, anon, authenticated;

grant select on app.size_options to anon, authenticated;
-- CHECK constraints call this as the caller.
grant execute on function app.array_is_distinct(text[]) to anon, authenticated;
grant execute on function app.follower_count(uuid) to anon, authenticated;

grant insert (size, payment_methods, couriers) on app.listings to authenticated;
grant update (size, payment_methods, couriers) on app.listings to authenticated;

grant select, delete on app.follows to authenticated;
grant insert (follower_id, followed_id) on app.follows to authenticated;

alter table app.size_options enable row level security;
alter table app.follows enable row level security;

create policy size_options_read on app.size_options for select to anon, authenticated
  using (true);

create policy follows_read_own on app.follows for select to authenticated
  using (follower_id = (select auth.uid()));
create policy follows_insert_own on app.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
create policy follows_delete_own on app.follows for delete to authenticated
  using (follower_id = (select auth.uid()));
