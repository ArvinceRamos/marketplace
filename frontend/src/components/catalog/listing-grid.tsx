import type { ReactNode } from "react";
import type { ListingCard as Card } from "@/lib/catalog-types";
import { ListingCard } from "./listing-card";

export function ListingGrid({ listings, empty }: { listings: Card[]; empty?: ReactNode }) {
  if (listings.length === 0) return <>{empty}</>;
  return (
    <ul className="product-grid" role="list">
      {listings.map((listing, i) => (
        <li key={listing.id}>
          <ListingCard listing={listing} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}

export function ListingGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <ul className="product-grid" aria-busy="true" aria-label="Loading listings">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex flex-col gap-2">
          <div className="media-frame animate-pulse" />
          <div className="h-5 w-1/3 animate-pulse rounded-sm bg-ink-100" />
          <div className="h-4 w-4/5 animate-pulse rounded-sm bg-ink-100" />
        </li>
      ))}
    </ul>
  );
}
