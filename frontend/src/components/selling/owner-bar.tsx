"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import type { ListingDetail } from "@/lib/catalog-types";
import { createClient } from "@/lib/supabase/client";

/**
 * The listing page is rendered for everyone without a token, so the server can't
 * know who owns it. Signed-in visitors ask the API (which checks the token).
 */
export function OwnerBar({ listingId }: { listingId: string }) {
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getSession()
      .then(({ data }) =>
        data.session ? apiFetch<ListingDetail>(`/listings/${listingId}`) : null,
      )
      .then((detail) => active && setOwner(Boolean(detail?.is_owner)))
      .catch(() => active && setOwner(false));
    return () => {
      active = false;
    };
  }, [listingId]);

  if (!owner) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-accent-soft p-3">
      <p className="text-small font-medium">This is your listing.</p>
      <div className="flex gap-2">
        <ButtonLink href={`/my-listings/${listingId}/edit`} size="sm">
          Edit
        </ButtonLink>
        <ButtonLink href="/my-listings" size="sm" variant="secondary">
          My listings
        </ButtonLink>
      </div>
    </div>
  );
}
