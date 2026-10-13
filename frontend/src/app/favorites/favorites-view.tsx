"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/catalog/empty-state";
import { ListingGrid, ListingGridSkeleton } from "@/components/catalog/listing-grid";
import { ButtonLink } from "@/components/ui/button";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import type { ListingPage } from "@/lib/catalog-types";

/** Saved listings, newest first. Sold and paused items keep their label. */
export function FavoritesView() {
  const [data, setData] = useState<ListingPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Runs again whenever this page becomes visible, so removals elsewhere show up.
  useEffect(() => {
    apiFetch<ListingPage>("/me/favorites?page_size=48")
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Could not load your saved items."),
      );
  }, [attempt]);

  if (error) {
    return (
      <LoadError
        message={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!data) return <ListingGridSkeleton count={5} />;
  return (
    <div className="flex flex-col gap-4">
      {/* Keeps heading levels in order: page h1 → this h2 → card h3s. */}
      <h2 className="sr-only">Saved listings</h2>
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
