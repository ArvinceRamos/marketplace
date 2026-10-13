"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { useSession } from "@/components/providers";
import { ReportDialog } from "@/components/safety/report-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import type { ListingDetail } from "@/lib/catalog-types";

/**
 * The listing page is rendered for everyone without a token, so the server can't
 * know who is looking. Signed-in visitors ask the API (which checks the token):
 * owners get Edit; others get Save and Chat.
 */
export function ListingViewerPanel({
  listingId,
  title,
  status,
}: {
  listingId: string;
  title: string;
  status: ListingDetail["status"];
}) {
  const session = useSession();
  const router = useRouter();
  const [viewer, setViewer] = useState<Pick<ListingDetail, "is_owner" | "my_conversation_id"> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (session !== "user") return;
    let active = true;
    apiFetch<ListingDetail>(`/listings/${listingId}`)
      .then((d) => active && setViewer(d))
      .catch(() => active && setViewer(null));
    return () => {
      active = false;
    };
  }, [session, listingId]);

  if (session === "loading" || (session === "user" && !viewer)) {
    return <div className="h-11" aria-hidden />;
  }

  if (viewer?.is_owner) {
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

  async function openChat() {
    if (session === "guest") {
      router.push(`/login?next=${encodeURIComponent(`/listing/${listingId}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id } = await apiFetch<{ id: string }>(`/listings/${listingId}/conversations`, {
        method: "POST",
      });
      router.push(`/inbox/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open the chat. Try again.");
      setBusy(false);
    }
  }

  function openReport() {
    if (session === "guest") {
      router.push(`/login?next=${encodeURIComponent(`/listing/${listingId}`)}`);
      return;
    }
    setReporting(true);
  }

  const existingChat = viewer?.my_conversation_id;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        {existingChat ? (
          <ButtonLink href={`/inbox/${existingChat}`}>Open chat</ButtonLink>
        ) : status === "active" ? (
          <Button onClick={openChat} disabled={busy}>
            {busy ? "Opening…" : "Chat with seller"}
          </Button>
        ) : (
          <span />
        )}
        <FavoriteButton listingId={listingId} title={title} variant="full" />
      </div>
      {status === "active" && !existingChat && (
        <p className="text-caption text-fg-muted">Ask questions or make an offer in the chat.</p>
      )}
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={openReport}
        className="self-end rounded-sm px-1 text-caption text-fg-muted underline-offset-2 hover:text-fg hover:underline"
      >
        Report this listing
      </button>
      <ReportDialog
        open={reporting}
        target={{ type: "listing", listingId, label: title }}
        onClose={() => setReporting(false)}
      />
    </div>
  );
}
