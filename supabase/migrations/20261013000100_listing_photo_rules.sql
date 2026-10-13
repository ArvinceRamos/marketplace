-- Phase 4: an active listing must keep at least one photo.
-- The API checks this first (friendly 409); this trigger is the second wall.
-- Draft, paused, and sold listings may drop to zero photos; publishing or
-- resuming checks again in listings_guard.

create function app.listing_images_keep_one() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from app.listings l
             where l.id = old.listing_id and l.status = 'active')
     and not exists (select 1 from app.listing_images i
                     where i.listing_id = old.listing_id and i.id <> old.id) then
    raise exception 'an active listing needs at least one photo' using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger listing_images_keep_one before delete on app.listing_images
  for each row execute function app.listing_images_keep_one();
