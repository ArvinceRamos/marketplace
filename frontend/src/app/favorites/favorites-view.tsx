"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/catalog/empty-state";
import { ListingGrid, ListingGridSkeleton } from "@/components/catalog/listing-grid";
import { ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api";
import type { ListingPage } from "@/lib/catalog-types";

/** Saved listings, newest first. Sold and paused items keep their label. */
export function FavoritesView() {
  const [data, setData] = useState<ListingPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Runs again whenever this page becomes visible, so removals elsewhere show up.
  useEffect(() => {
    apiFetch<ListingPage>("/me/favorites?page_size=48")
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Could not load your saved items."),
      );
  }, []);

  if (error) return <FormAlert message={error} />;
  if (!data) return <ListingGridSkeleton count={5} />;
  return (
    <div className="flex flex-col gap-4">
      {data.total > data.items.length && (
        <p className="text-small text-fg-muted">Showing your {data.items.length} newest saved items.</p>
      )}
      <ListingGrid
        listings={data.items}
        empty={
          <EmptyState
            title="No saved items yet"
            body="Tap the heart on any listing to keep it here."
            action={<ButtonLink href="/search">Browse listings</ButtonLink>}
          />
        }
      />
    </div>
  );
}
