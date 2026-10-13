import { CONDITIONS, SORTS, type Condition, type Sort } from "@/lib/catalog-types";

/** Raw Next.js searchParams. */
export type RawParams = Record<string, string | string[] | undefined>;

export type Filters = {
  q?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  condition: Condition[];
  city?: string;
  sort: Sort;
  page: number;
};

const SLUG = /^[a-z0-9-]{2,60}$/;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function int(v: string | undefined, min: number, max: number): number | undefined {
  if (!v || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

/**
 * Turn URL parameters into safe, typed filters. Invalid values are dropped
 * (the page still works) rather than sent to the API.
 */
export function parseFilters(raw: RawParams): Filters {
  const q = first(raw.q)?.trim().slice(0, 100) || undefined;
  const category = first(raw.category);
  const city = first(raw.city);
  const sortRaw = first(raw.sort);
  const conditions = ([] as string[]).concat(raw.condition ?? []);
  let min = int(first(raw.min_price), 0, 100_000_000);
  let max = int(first(raw.max_price), 0, 100_000_000);
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  const sort = SORTS.includes(sortRaw as Sort) ? (sortRaw as Sort) : q ? "relevance" : "newest";
  return {
    q,
    category: category && SLUG.test(category) ? category : undefined,
    city: city && SLUG.test(city) ? city : undefined,
    min_price: min,
    max_price: max,
    condition: conditions.filter((c): c is Condition => CONDITIONS.includes(c as Condition)),
    sort: sort === "relevance" && !q ? "newest" : sort,
    page: int(first(raw.page), 1, 50) ?? 1,
  };
}

/** Build a query string from filters, leaving out defaults. */
export function toQuery(f: Partial<Filters>, overrides: Partial<Filters> = {}): string {
  const merged = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (merged.q) p.set("q", merged.q);
  if (merged.category) p.set("category", merged.category);
  if (merged.min_price !== undefined) p.set("min_price", String(merged.min_price));
  if (merged.max_price !== undefined) p.set("max_price", String(merged.max_price));
  for (const c of merged.condition ?? []) p.append("condition", c);
  if (merged.city) p.set("city", merged.city);
  const defaultSort = merged.q ? "relevance" : "newest";
  if (merged.sort && merged.sort !== defaultSort) p.set("sort", merged.sort);
  if (merged.page && merged.page > 1) p.set("page", String(merged.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}
