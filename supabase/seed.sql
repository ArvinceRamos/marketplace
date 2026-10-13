-- LOCAL DEVELOPMENT ONLY. Never run against a hosted project.
-- Runs after migrations on `supabase start` (first time) and `supabase db reset`.
-- Demo users, listings, and photos are added separately by `npm run db:demo`.

-- Local-only password for the API role. Not a secret: it only works on your
-- machine's local stack. Hosted projects get their own password, set manually.
alter role api_app with password 'api_app_local_dev_only';

-- ---------------------------------------------------------------------------
-- Locations: city level only (privacy). A curated list; full PSGC import later.
-- ---------------------------------------------------------------------------
insert into app.locations (region, province, city, slug) values
  ('NCR', 'Metro Manila', 'Quezon City', 'quezon-city'),
  ('NCR', 'Metro Manila', 'Manila', 'manila'),
  ('NCR', 'Metro Manila', 'Makati', 'makati'),
  ('NCR', 'Metro Manila', 'Taguig', 'taguig'),
  ('NCR', 'Metro Manila', 'Pasig', 'pasig'),
  ('NCR', 'Metro Manila', 'Mandaluyong', 'mandaluyong'),
  ('NCR', 'Metro Manila', 'San Juan', 'san-juan'),
  ('NCR', 'Metro Manila', 'Marikina', 'marikina'),
  ('NCR', 'Metro Manila', 'Caloocan', 'caloocan'),
  ('NCR', 'Metro Manila', 'Valenzuela', 'valenzuela'),
  ('NCR', 'Metro Manila', 'Malabon', 'malabon'),
  ('NCR', 'Metro Manila', 'Navotas', 'navotas'),
  ('NCR', 'Metro Manila', 'Parañaque', 'paranaque'),
  ('NCR', 'Metro Manila', 'Las Piñas', 'las-pinas'),
  ('NCR', 'Metro Manila', 'Muntinlupa', 'muntinlupa'),
  ('NCR', 'Metro Manila', 'Pasay', 'pasay'),
  ('Region I', 'Pangasinan', 'Dagupan', 'dagupan'),
  ('Region I', 'Ilocos Norte', 'Laoag', 'laoag'),
  ('CAR', 'Benguet', 'Baguio', 'baguio'),
  ('Region II', 'Cagayan', 'Tuguegarao', 'tuguegarao'),
  ('Region III', 'Pampanga', 'Angeles', 'angeles'),
  ('Region III', 'Pampanga', 'San Fernando (Pampanga)', 'san-fernando-pampanga'),
  ('Region III', 'Bulacan', 'Malolos', 'malolos'),
  ('Region III', 'Bulacan', 'Meycauayan', 'meycauayan'),
  ('Region III', 'Bulacan', 'San Jose del Monte', 'san-jose-del-monte'),
  ('Region III', 'Nueva Ecija', 'Cabanatuan', 'cabanatuan'),
  ('Region III', 'Tarlac', 'Tarlac City', 'tarlac-city'),
  ('Region III', 'Zambales', 'Olongapo', 'olongapo'),
  ('Region IV-A', 'Cavite', 'Bacoor', 'bacoor'),
  ('Region IV-A', 'Cavite', 'Dasmariñas', 'dasmarinas'),
  ('Region IV-A', 'Cavite', 'Imus', 'imus'),
  ('Region IV-A', 'Laguna', 'Calamba', 'calamba'),
  ('Region IV-A', 'Laguna', 'Santa Rosa', 'santa-rosa'),
  ('Region IV-A', 'Laguna', 'San Pedro', 'san-pedro'),
  ('Region IV-A', 'Batangas', 'Batangas City', 'batangas-city'),
  ('Region IV-A', 'Batangas', 'Lipa', 'lipa'),
  ('Region IV-A', 'Rizal', 'Antipolo', 'antipolo'),
  ('Region IV-A', 'Rizal', 'Cainta', 'cainta'),
  ('Region IV-A', 'Quezon', 'Lucena', 'lucena'),
  ('MIMAROPA', 'Palawan', 'Puerto Princesa', 'puerto-princesa'),
  ('Region V', 'Albay', 'Legazpi', 'legazpi'),
  ('Region V', 'Camarines Sur', 'Naga', 'naga'),
  ('Region VI', 'Iloilo', 'Iloilo City', 'iloilo-city'),
  ('Region VI', 'Negros Occidental', 'Bacolod', 'bacolod'),
  ('Region VII', 'Cebu', 'Cebu City', 'cebu-city'),
  ('Region VII', 'Cebu', 'Mandaue', 'mandaue'),
  ('Region VII', 'Cebu', 'Lapu-Lapu', 'lapu-lapu'),
  ('Region VII', 'Bohol', 'Tagbilaran', 'tagbilaran'),
  ('Region VII', 'Negros Oriental', 'Dumaguete', 'dumaguete'),
  ('Region VIII', 'Leyte', 'Tacloban', 'tacloban'),
  ('Region IX', 'Zamboanga del Sur', 'Zamboanga City', 'zamboanga-city'),
  ('Region X', 'Misamis Oriental', 'Cagayan de Oro', 'cagayan-de-oro'),
  ('Region X', 'Lanao del Norte', 'Iligan', 'iligan'),
  ('Region XI', 'Davao del Sur', 'Davao City', 'davao-city'),
  ('Region XI', 'Davao del Norte', 'Tagum', 'tagum'),
  ('Region XII', 'South Cotabato', 'General Santos', 'general-santos'),
  ('Region XII', 'South Cotabato', 'Koronadal', 'koronadal'),
  ('Caraga', 'Agusan del Norte', 'Butuan', 'butuan'),
  ('BARMM', 'Maguindanao del Norte', 'Cotabato City', 'cotabato-city');

-- ---------------------------------------------------------------------------
-- Categories: two levels. Listings must use a subcategory (leaf).
-- ---------------------------------------------------------------------------
insert into app.categories (slug, name, sort_order) values
  ('electronics', 'Electronics', 1),
  ('fashion', 'Fashion', 2),
  ('home-living', 'Home & Living', 3),
  ('hobbies', 'Hobbies & Sports', 4),
  ('baby-kids', 'Baby & Kids', 5),
  ('vehicle-parts', 'Vehicle Parts', 6);

insert into app.categories (parent_id, slug, name, sort_order)
select c.id, v.slug, v.name, v.sort_order
from (values
  ('electronics', 'mobile-phones', 'Mobile Phones', 1),
  ('electronics', 'laptops', 'Laptops & Computers', 2),
  ('electronics', 'tablets', 'Tablets', 3),
  ('electronics', 'audio', 'Audio & Headphones', 4),
  ('electronics', 'cameras', 'Cameras', 5),
  ('electronics', 'gaming', 'Gaming', 6),
  ('fashion', 'womens-fashion', 'Women''s Fashion', 1),
  ('fashion', 'mens-fashion', 'Men''s Fashion', 2),
  ('fashion', 'shoes', 'Shoes', 3),
  ('fashion', 'bags', 'Bags', 4),
  ('fashion', 'watches-jewelry', 'Watches & Jewelry', 5),
  ('home-living', 'furniture', 'Furniture', 1),
  ('home-living', 'kitchen', 'Kitchen & Dining', 2),
  ('home-living', 'appliances', 'Home Appliances', 3),
  ('home-living', 'decor', 'Decor & Plants', 4),
  ('hobbies', 'books', 'Books', 1),
  ('hobbies', 'sports', 'Sports & Outdoors', 2),
  ('hobbies', 'toys-collectibles', 'Toys & Collectibles', 3),
  ('hobbies', 'music-instruments', 'Musical Instruments', 4),
  ('baby-kids', 'baby-gear', 'Baby Gear', 1),
  ('baby-kids', 'kids-clothing', 'Kids'' Clothing', 2),
  ('vehicle-parts', 'motorcycle-parts', 'Motorcycle Parts & Gear', 1),
  ('vehicle-parts', 'car-accessories', 'Car Accessories', 2)
) as v(parent_slug, slug, name, sort_order)
join app.categories c on c.slug = v.parent_slug;

-- Size lists (Phase 7). The lists themselves are in the migration (app.size_options).
update app.categories set size_group = 'clothing' where slug in ('womens-fashion', 'mens-fashion');
update app.categories set size_group = 'shoes' where slug = 'shoes';
update app.categories set size_group = 'kids' where slug = 'kids-clothing';
