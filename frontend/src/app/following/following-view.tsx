"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { EmptyState } from "@/components/catalog/empty-state";
import { ListingGrid, ListingGridSkeleton } from "@/components/catalog/listing-grid";
import { ButtonLink } from "@/components/ui/button";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import type { ListingPage } from "@/lib/catalog-types";
import type { FollowedSeller } from "@/lib/follows";
import { personName } from "@/lib/social";

const FEED_SIZE = 48;

/** New listings from sellers you follow, newest first, and who you follow. */
export function FollowingView() {
  const [sellers, setSellers] = useState<FollowedSeller[] | null>(null);
  const [feed, setFeed] = useState<ListingPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Runs again when this page becomes visible, so follows made elsewhere show up.
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<FollowedSeller[]>("/me/following"),
      apiFetch<ListingPage>(`/me/feed?page_size=${FEED_SIZE}`),
    ])
      .then(([s, f]) => {
        if (!active) return;
        setSellers(s);
        setFeed(f);
      })
      .catch(
        (e: unknown) =>
          active && setError(e instanceof ApiError ? e.message : "Could not load your feed."),
      );
    return () => {
      active = false;
    };
  }, [attempt]);

  // Pages stay mounted (hidden) after navigation. Drop account data when hidden.
  useLayoutEffect(
    () => () => {
      setSellers(null);
      setFeed(null);
      setError(null);
    },
    [],
  );

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
  if (!sellers || !feed) return <ListingGridSkeleton count={5} />;

  if (sellers.length === 0) {
    return (
      <EmptyState
        title="You're not following anyone yet"
        body="Follow sellers you like from their profile. Their new listings will show up here."
        action={<ButtonLink href="/search">Browse listings</ButtonLink>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="following-sellers" className="flex flex-col gap-2">
        <h2 id="following-sellers" className="text-title">
          Sellers you follow{" "}
          <span className="font-regular text-fg-muted" data-numeric>
            ({sellers.length})
          </span>
        </h2>
        <ul className="scroll-row">
          {sellers.map((s) => (
            <li key={s.username} className="shrink-0">
              <Link
                href={`/seller/${s.username}`}
                className="flex min-h-11 items-center gap-2 rounded-full border border-border py-0.5 pr-4 pl-0.5 text-small hover:bg-ink-100"
              >
                <Avatar name={personName(s)} url={s.avatar_url} />
                {personName(s)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="following-feed" className="flex flex-col gap-4">
        <h2 id="following-feed" className="text-title">
          New from them
        </h2>
        {feed.total > feed.items.length && (
          <p className="text-small text-fg-muted">Showing the {feed.items.length} newest items.</p>
        )}
        <ListingGrid
          listings={feed.items}
          empty={
            <EmptyState
              title="Nothing for sale right now"
              body="The sellers you follow have no active listings. Check back later."
            />
          }
        />
      </section>
    </div>
  );
}
