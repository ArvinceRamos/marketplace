import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/lib/env";
import type { ReviewList } from "@/lib/orders";
import type {
  CategoryNode,
  ListingDetail,
  ListingPage,
  Location,
  PublicProfile,
} from "@/lib/catalog-types";
import { toQuery, type Filters } from "@/lib/search-params";

/** Thrown when the API is unreachable or slow (e.g. waking up on a free host). */
export class CatalogUnavailableError extends Error {}

// Public data only; requests carry no user token. Wrapped in cached functions below.
async function get<T>(path: string, { allow404 = false } = {}): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${env.apiBaseUrl}/api/v1${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new CatalogUnavailableError("The marketplace server is not responding.");
  }
  if (res.status === 404 && allow404) return null;
  if (!res.ok) throw new CatalogUnavailableError(`API error ${res.status} for ${path}`);
  return (await res.json()) as T;
}

// Public data is the same for every visitor, so the Next server caches it. A throw skips
// the cache, and a 404 is kept for the short window. connection() keeps these calls out of
// the build-time prerender (as the old uncached fetch was), so a build never needs the API
// awake; the cache applies at request time.

async function cachedReference<T>(path: string): Promise<T | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("reference");
  return get<T>(path);
}

async function cachedPublic<T>(path: string, allow404: boolean): Promise<T | null> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  cacheTag("public");
  return get<T>(path, { allow404 });
}

/** Reference lists (categories, locations): change rarely. */
async function getReference<T>(path: string): Promise<T | null> {
  await connection();
  return cachedReference<T>(path);
}

/** Listings and profiles: a sold or edited item may show for up to a minute. */
async function getPublic<T>(path: string, allow404 = false): Promise<T | null> {
  await connection();
  return cachedPublic<T>(path, allow404);
}

export async function getCategories(): Promise<CategoryNode[]> {
  return (await getReference<CategoryNode[]>("/categories")) ?? [];
}

export async function getLocations(): Promise<Location[]> {
  return (await getReference<Location[]>("/locations")) ?? [];
}

export async function searchListings(filters: Partial<Filters>, pageSize = 24) {
  const query = toQuery(filters);
  const sep = query ? "&" : "?";
  return (await getPublic<ListingPage>(`/listings${query}${sep}page_size=${pageSize}`))!;
}

export async function getListingOr404(id: string): Promise<ListingDetail> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return (await getPublic<ListingDetail>(`/listings/${id}`, true)) ?? notFound();
}

export async function getProfileOr404(username: string): Promise<PublicProfile> {
  if (!/^[A-Za-z0-9_.]{3,30}$/.test(username)) notFound();
  return (
    (await getPublic<PublicProfile>(`/profiles/${encodeURIComponent(username)}`, true)) ??
    notFound()
  );
}

/** A public profile, or null when it doesn't exist or can't be loaded (for extras). */
export async function getProfile(username: string): Promise<PublicProfile | null> {
  try {
    return await getPublic<PublicProfile>(`/profiles/${encodeURIComponent(username)}`, true);
  } catch {
    return null;
  }
}

export async function getSellerListings(username: string, page = 1) {
  const q = page > 1 ? `?page=${page}` : "";
  return (await getPublic<ListingPage>(`/profiles/${encodeURIComponent(username)}/listings${q}`))!;
}

export async function getSellerReviews(username: string): Promise<ReviewList> {
  return (await getPublic<ReviewList>(`/profiles/${encodeURIComponent(username)}/reviews`))!;
}

export function findCategory(tree: CategoryNode[], slug: string) {
  for (const parent of tree) {
    if (parent.slug === slug) return { category: parent, parent: null };
    const child = parent.children.find((c) => c.slug === slug);
    if (child) return { category: child, parent };
  }
  return null;
}
