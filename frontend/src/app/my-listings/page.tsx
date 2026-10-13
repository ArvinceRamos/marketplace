import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Container, Stack } from "@/components/ui/layout";
import { MY_LISTING_TABS, type ListingStatus } from "@/lib/selling";
import { MyListingsView } from "./my-listings-view";

export const metadata: Metadata = { title: "My listings · Marketplace", robots: { index: false } };

type Props = PageProps<"/my-listings">;

export default function MyListingsPage({ searchParams }: Props) {
  return (
    <main className="flex-1">
      <Container width="prose" className="section-y">
        <Stack gap={6}>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-heading lg:text-display">My listings</h1>
            <ButtonLink href="/sell">Sell an item</ButtonLink>
          </div>
          <Suspense fallback={<p aria-busy="true">Loading…</p>}>
            <Tabs searchParams={searchParams} />
          </Suspense>
        </Stack>
      </Container>
    </main>
  );
}

async function Tabs({ searchParams }: Pick<Props, "searchParams">) {
  const query = await searchParams;
  const status: ListingStatus =
    MY_LISTING_TABS.find((t) => t.status === query.status)?.status ?? "active";
  const page = Math.min(50, Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1));
  return (
    <>
      <nav aria-label="Listing status" className="scroll-row -mx-1 border-b border-border px-1">
        {MY_LISTING_TABS.map((tab) => {
          const current = tab.status === status;
          return (
            <Link
              key={tab.status}
              href={`/my-listings?status=${tab.status}`}
              aria-current={current ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-3 py-3 text-small font-medium ${
                current
                  ? "border-accent text-fg"
                  : "border-transparent text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <MyListingsView key={`${status}-${page}`} status={status} page={page} />
    </>
  );
}
