// Shapes returned by the FastAPI browse endpoints (docs/API_SPECIFICATION.md).

export const CONDITIONS = [
  "brand_new",
  "like_new",
  "lightly_used",
  "well_used",
  "heavily_used",
] as const;
export type Condition = (typeof CONDITIONS)[number];

// Deal options are labels only: payments and couriers are arranged outside the app.
export const PAYMENT_METHODS = ["gcash", "maya", "bank_transfer", "cash", "cod"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const COURIERS = ["jnt", "flash", "lbc", "lalamove", "grab"] as const;
export type Courier = (typeof COURIERS)[number];

export const SORTS = ["newest", "price_asc", "price_desc", "relevance"] as const;
export type Sort = (typeof SORTS)[number];

export type CategoryRef = { id: number; slug: string; name: string };
/** A subcategory, with its size list (empty when the category has no sizes). */
export type CategoryChild = CategoryRef & { sizes: string[] };
export type CategoryNode = CategoryRef & { children: CategoryChild[] };
export type Location = { id: number; slug: string; city: string; province: string; region: string };
export type CityRef = { id: number; slug: string; name: string };

export type ListingCard = {
  id: string;
  title: string;
  price_centavos: number;
  condition: Condition;
  status: "draft" | "active" | "paused" | "sold" | "reserved";
  city: CityRef;
  cover_thumb_url: string | null;
  seller: { username: string; display_name: string | null; avatar_url: string | null };
  published_at: string | null;
  size: string | null;
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
  payment_methods: PaymentMethod[];
  couriers: Courier[];
  created_at: string;
  updated_at: string;
  is_owner: boolean;
  // Only meaningful for a signed-in viewer.
  is_favorited: boolean;
  my_open_order_id?: string | null;
  my_conversation_id: string | null;
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
  follower_count: number;
};
