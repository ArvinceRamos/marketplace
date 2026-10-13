import { Suspense } from "react";
import { CategoryChips } from "@/components/catalog/category-chips";
import { ListingGrid, ListingGridSkeleton } from "@/components/catalog/listing-grid";
import { EmptyState } from "@/components/catalog/empty-state";
import { Container, Stack } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/text-link";
import { getCategories, searchListings } from "@/lib/catalog";

export default function Home() {
  return (
    <main className="flex-1">
      <Container className="section-y">
        <Stack gap={8}>
          <Stack gap={2}>
            <h1 className="text-heading lg:text-display">Buy and sell preloved finds near you</h1>
            <p className="max-w-2xl text-body text-fg-muted">
              Phones, clothes, furniture, and more from people across the Philippines. Chat with
              the seller and arrange the meetup or delivery yourselves.
            </p>
          </Stack>
          <Suspense fallback={<div className="h-9 w-full animate-pulse rounded-full bg-ink-100" />}>
            <TopCategories />
          </Suspense>
          <section aria-labelledby="recent-heading" className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="recent-heading" className="text-title">
                Recently listed
              </h2>
              <TextLink href="/search" className="text-small">
                See all
              </TextLink>
            </div>
            <Suspense fallback={<ListingGridSkeleton />}>
              <RecentListings />
            </Suspense>
          </section>
        </Stack>
      </Container>
    </main>
  );
}

async function TopCategories() {
  const tree = await getCategories();
  return <CategoryChips categories={tree} />;
}

async function RecentListings() {
  const page = await searchListings({ sort: "newest", condition: [], page: 1 }, 20);
  return (
    <ListingGrid
      listings={page.items}
      empty={<EmptyState title="Nothing listed yet" body="New listings will show up here." />}
    />
  );
}
