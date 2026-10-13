import type { Metadata } from "next";
import { Suspense } from "react";
import { Results, ResultsSkeleton } from "@/components/catalog/results";
import { Container, Stack } from "@/components/ui/layout";
import { parseFilters } from "@/lib/search-params";

export const metadata: Metadata = { title: "Search · Marketplace" };

export default function SearchPage(props: PageProps<"/search">) {
  return (
    <main className="flex-1">
      <Container className="section-y">
        <Suspense fallback={<ResultsSkeleton />}>
          <SearchContent searchParams={props.searchParams} />
        </Suspense>
      </Container>
    </main>
  );
}

async function SearchContent({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const filters = parseFilters(await searchParams);
  return (
    <Stack gap={6}>
      <h1 className="text-heading lg:text-display">
        {filters.q ? <>Results for &ldquo;{filters.q}&rdquo;</> : "All items"}
      </h1>
      <Results action="/search" filters={filters} showCategory />
    </Stack>
  );
}
