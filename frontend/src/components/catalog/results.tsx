import { ButtonLink } from "@/components/ui/button";
import { getCategories, getLocations, searchListings } from "@/lib/catalog";
import { toQuery, type Filters } from "@/lib/search-params";
import { EmptyState } from "./empty-state";
import { FilterPanel } from "./filter-panel";
import { ListingGrid, ListingGridSkeleton } from "./listing-grid";
import { Pagination } from "./pagination";

const PAGE_SIZE = 24;

/** Filters sidebar + result grid + pagination. Data is fetched at request time. */
export async function Results({
  action,
  filters,
  showCategory,
}: {
  action: string;
  filters: Filters;
  showCategory: boolean;
}) {
  const [page, categories, locations] = await Promise.all([
    searchListings(filters, PAGE_SIZE),
    getCategories(),
    getLocations(),
  ]);
  // On category pages the category is in the path, so keep it out of link query strings.
  const linkFilters = showCategory ? filters : { ...filters, category: undefined };
  const filtered =
    filters.min_price !== undefined ||
    filters.max_price !== undefined ||
    filters.condition.length > 0 ||
    Boolean(filters.city);

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr] lg:gap-8">
      <aside aria-label="Filters" className="lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:self-start">
        <FilterPanel
          action={action}
          filters={filters}
          categories={categories}
          locations={locations}
          showCategory={showCategory}
        />
      </aside>
      <section aria-labelledby="results-heading" className="flex flex-col gap-4">
        {/* Keeps heading levels in order: page h1 → this h2 → card h3s. */}
        <h2 id="results-heading" className="sr-only">
          Results
        </h2>
        <p className="text-small text-fg-muted" role="status" data-numeric>
          {page.total === 1 ? "1 item" : `${page.total.toLocaleString("en-PH")} items`}
        </p>
        <ListingGrid
          listings={page.items}
          empty={
            <EmptyState
              title="No items found"
              body={
                filtered
                  ? "Try removing a filter or widening the price range."
                  : "Try a different word, or browse a category instead."
              }
              action={
                <ButtonLink href={filtered ? `${action}${toQuery({ q: filters.q })}` : "/"} variant="secondary">
                  {filtered ? "Clear filters" : "Browse all items"}
                </ButtonLink>
              }
            />
          }
        />
        <Pagination
          page={page.page}
          hasNext={page.has_next}
          total={page.total}
          pageSize={PAGE_SIZE}
          hrefFor={(p) => `${action}${toQuery(linkFilters, { page: p })}`}
        />
      </section>
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr] lg:gap-8">
      <div className="hidden h-96 animate-pulse rounded-md bg-surface-muted lg:block" />
      <div className="flex flex-col gap-4">
        <div className="h-5 w-20 animate-pulse rounded-sm bg-ink-100" />
        <ListingGridSkeleton />
      </div>
    </div>
  );
}
