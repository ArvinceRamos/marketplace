-- Storage buckets for listing photos and avatars. See docs/ARCHITECTURE.md §7.
-- Files are re-encoded to WebP by the API before upload, so only WebP is allowed.
-- Public read (listing photos and avatars are public anyway); writes only into
-- a folder named after the caller's user ID: "<user_id>/...".

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-images', 'listing-images', true, 2097152, array['image/webp']),
  ('avatars', 'avatars', true, 1048576, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "own folder: read" on storage.objects for select to authenticated
  using (bucket_id in ('listing-images', 'avatars')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own folder: upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('listing-images', 'avatars')
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own folder: update" on storage.objects for update to authenticated
  using (bucket_id in ('listing-images', 'avatars')
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('listing-images', 'avatars')
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own folder: delete" on storage.objects for delete to authenticated
  using (bucket_id in ('listing-images', 'avatars')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
