"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSession } from "@/components/providers";
import { apiFetch } from "@/lib/api";
import type { ListingCard, ListingViewer } from "@/lib/catalog-types";

type ListingStatus = ListingCard["status"];

type ViewerState = {
  /** null for guests, undefined while loading. */
  viewer: ListingViewer | null | undefined;
  status: ListingStatus;
  isOwner: boolean;
  /** After the owner changes the status on this page. */
  setStatus: (status: ListingStatus) => void;
};

const Ctx = createContext<ViewerState | null>(null);

/**
 * The listing page is public and the same for everyone. This asks the API once, for
 * a signed-in visitor, what they can do here (GET /listings/{id}/viewer), and shares
 * it with the action bar, the gallery, and the recommendation rows.
 */
export function ListingViewerProvider({
  listingId,
  status: initialStatus,
  children,
}: {
  listingId: string;
  status: ListingStatus;
  children: ReactNode;
}) {
  const session = useSession();
  const [viewer, setViewer] = useState<ListingViewer | null | undefined>(undefined);
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    if (session !== "user") return;
    let active = true;
    apiFetch<ListingViewer>(`/listings/${listingId}/viewer`)
      .then((v) => {
        if (!active) return;
        setViewer(v);
        setStatus(v.status);
      })
      .catch(() => active && setViewer(null));
    return () => {
      active = false;
    };
  }, [session, listingId]);

  const value: ViewerState = {
    viewer: session === "guest" ? null : session === "loading" ? undefined : viewer,
    status,
    isOwner: Boolean(session === "user" && viewer?.is_owner),
    setStatus,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useListingViewer(): ViewerState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useListingViewer needs ListingViewerProvider");
  return value;
}

/** Hides its children from the listing's owner (recommendations, report link). */
export function NotForOwner({ children }: { children: ReactNode }) {
  return useListingViewer().isOwner ? null : <>{children}</>;
}
