-- LOCAL DEVELOPMENT ONLY. Never run against a hosted project.
-- Runs after migrations on `supabase start` (first time) and `supabase db reset`.

-- Local-only password for the API role. Not a secret: it only works on your
-- machine's local stack. Hosted projects get their own password, set manually.
alter role api_app with password 'api_app_local_dev_only';

-- Reference data (fuller lists come in Phase 3).
insert into app.locations (region, province, city, slug) values
  ('NCR', 'Metro Manila', 'Quezon City', 'quezon-city'),
  ('NCR', 'Metro Manila', 'Manila', 'manila'),
  ('NCR', 'Metro Manila', 'Makati', 'makati'),
  ('Region VII', 'Cebu', 'Cebu City', 'cebu-city'),
  ('Region XI', 'Davao del Sur', 'Davao City', 'davao-city');

insert into app.categories (slug, name, sort_order) values
  ('electronics', 'Electronics', 1),
  ('fashion', 'Fashion', 2);
insert into app.categories (parent_id, slug, name, sort_order)
select c.id, v.slug, v.name, v.sort_order
from (values
  ('electronics', 'mobile-phones', 'Mobile Phones', 1),
  ('electronics', 'laptops', 'Laptops', 2),
  ('fashion', 'womens-fashion', 'Women''s Fashion', 1),
  ('fashion', 'mens-fashion', 'Men''s Fashion', 2)
) as v(parent_slug, slug, name, sort_order)
join app.categories c on c.slug = v.parent_slug;
