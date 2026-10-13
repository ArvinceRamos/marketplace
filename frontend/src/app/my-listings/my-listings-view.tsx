"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/catalog/empty-state";
import { Pagination } from "@/components/catalog/pagination";
import { ListingActions } from "@/components/selling/listing-actions";
import { ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api";
import type { ListingPage } from "@/lib/catalog-types";
import { CONDITION_LABELS, formatPrice } from "@/lib/format";
import { MY_LISTING_TABS, type ListingStatus } from "@/lib/selling";

const PAGE_SIZE = 24;
const MOVED: Record<ListingStatus | "deleted", string> = {
  active: "Listing is live.",
  paused: "Listing paused. Find it under Paused.",
  sold: "Marked as sold. Find it under Sold.",
  draft: "Saved as a draft.",
  deleted: "Listing deleted.",
};

export function MyListingsView({ status, page }: { status: ListingStatus; page: number }) {
  const [data, setData] = useState<ListingPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Also re-runs when this page becomes visible again after navigating away.
  useEffect(() => {
    apiFetch<ListingPage>(`/me/listings?status=${status}&page=${page}&page_size=${PAGE_SIZE}`)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Could not load your listings."),
      );
  }, [status, page, reload]);

  const tab = MY_LISTING_TABS.find((t) => t.status === status)!;

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-small text-success empty:hidden">
        {notice}
      </p>
      <FormAlert message={error} />
      {!data && !error && <p aria-busy="true">Loading…</p>}
      {data && data.items.length === 0 && (
        <EmptyState
          title={tab.empty}
          action={<ButtonLink href="/sell">Sell an item</ButtonLink>}
        />
      )}
      {data && data.items.length > 0 && (
        <ul className="flex flex-col">
          {data.items.map((item) => (
            <li key={item.id} className="flex gap-3 border-b border-border py-4 sm:gap-4">
              <div className="media-frame w-20 shrink-0 sm:w-24">
                {item.cover_thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.cover_thumb_url} alt="" loading="lazy" />
                ) : (
                  <span className="absolute inset-0 grid place-items-center text-center text-caption text-fg-subtle">
                    No photo
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                  <Link
                    href={item.status === "draft" ? `/my-listings/${item.id}/edit` : `/listing/${item.id}`}
                    className="link line-clamp-2 text-small font-medium"
                  >
                    {item.title}
                  </Link>
                  <p className="text-caption text-fg-muted" data-numeric>
                    {formatPrice(item.price_centavos)} · {CONDITION_LABELS[item.condition]}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <ButtonLink href={`/my-listings/${item.id}/edit`} size="sm" variant="secondary">
                    Edit
                  </ButtonLink>
                  <ListingActions
                    listingId={item.id}
                    status={item.status}
                    onDone={(next) => {
                      setNotice(MOVED[next]);
                      setReload((n) => n + 1);
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && (
        <Pagination
          page={page}
          hasNext={data.has_next}
          total={data.total}
          pageSize={PAGE_SIZE}
          hrefFor={(p) => `/my-listings?status=${status}&page=${p}`}
        />
      )}
    </div>
  );
}
