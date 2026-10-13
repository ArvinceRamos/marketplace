// Shapes returned by the FastAPI browse endpoints (docs/API_SPECIFICATION.md).

export const CONDITIONS = [
  "brand_new",
  "like_new",
  "lightly_used",
  "well_used",
  "heavily_used",
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const SORTS = ["newest", "price_asc", "price_desc", "relevance"] as const;
export type Sort = (typeof SORTS)[number];

export type CategoryRef = { id: number; slug: string; name: string };
export type CategoryNode = CategoryRef & { children: CategoryRef[] };
export type Location = { id: number; slug: string; city: string; province: string; region: string };
export type CityRef = { id: number; slug: string; name: string };

export type ListingCard = {
  id: string;
  title: string;
  price_centavos: number;
  condition: Condition;
  status: "draft" | "active" | "paused" | "sold";
  city: CityRef;
  cover_thumb_url: string | null;
  seller: { username: string; display_name: string | null; avatar_url: string | null };
  published_at: string | null;
};

export type ListingImage = {
  id: string;
  position: number;
  full_url: string;
  thumb_url: string;
  width: number;
  height: number;
};

export type ListingDetail = ListingCard & {
  description: string;
  category: CategoryRef;
  parent_category: CategoryRef | null;
  images: ListingImage[];
  meetup: boolean;
  delivery: boolean;
  deal_note: string | null;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
};

export type ListingPage = {
  items: ListingCard[];
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
};

export type PublicProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  city: CityRef | null;
  joined_at: string;
  active_listing_count: number;
};
