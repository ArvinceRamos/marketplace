"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { useSession } from "@/components/providers";
import { ReportDialog } from "@/components/safety/report-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextLink } from "@/components/ui/text-link";
import { ApiError, apiFetch } from "@/lib/api";
import { STATUS_ACTIONS, type StatusAction } from "@/lib/selling";
import { useListingViewer } from "./viewer-context";

type Props = {
  listingId: string;
  title: string;
  /** Where "See similar items" goes (the listing's category page). */
  similarHref: string;
};

const UNAVAILABLE: Partial<Record<string, string>> = {
  sold: "Sold",
  reserved: "Reserved",
  paused: "Paused by the seller",
};

/**
 * The listing's actions. Rendered with the page using guest defaults (Buy, Chat), so
 * nothing pops in late; a signed-in visitor's own state (open chat, open order,
 * owner tools) swaps in at the same size. Desktop: a panel beside the photos.
 * Phones: a bar fixed to the bottom of the screen, within thumb reach.
 */
export function ListingCta({ listingId, title, similarHref }: Props) {
  const session = useSession();
  const router = useRouter();
  const { viewer, status, isOwner, setStatus } = useListingViewer();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<StatusAction | null>(null);

  const loginNext = `/login?next=${encodeURIComponent(`/listing/${listingId}`)}`;
  const chatId = viewer?.my_conversation_id ?? null;
  const orderId = viewer?.my_open_order_id ?? null;
  const active = status === "active";

  async function openChat() {
    if (session === "guest") {
      router.push(loginNext);
      return;
    }
    setBusy("chat");
    setError(null);
    try {
      const { id } = await apiFetch<{ id: string }>(`/listings/${listingId}/conversations`, { method: "POST" });
      router.push(`/inbox/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open the chat. Try again.");
      setBusy(null);
    }
  }

  async function changeStatus(action: StatusAction) {
    setBusy(action.to);
    setError(null);
    try {
      await apiFetch(`/listings/${listingId}/status`, {
        method: "POST",
        body: JSON.stringify({ status: action.to }),
      });
      setStatus(action.to);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  const statusButtons = (size: "md" | "sm" = "md") =>
    STATUS_ACTIONS[status].map((action) => (
      <Button
        key={action.to}
        variant="secondary"
        size={size}
        fullWidth
        disabled={busy !== null}
        onClick={() => (action.confirm ? setConfirming(action) : void changeStatus(action))}
      >
        {busy === action.to ? "Saving…" : action.label}
      </Button>
    ));

  const chatButton = chatId ? (
    <ButtonLink href={`/inbox/${chatId}`} variant="secondary" fullWidth>
      Open chat
    </ButtonLink>
  ) : (
    <Button variant="secondary" fullWidth onClick={openChat} disabled={busy !== null}>
      {busy === "chat" ? "Opening…" : "Chat with seller"}
    </Button>
  );
  const buyButton = (size: "md" | "lg") =>
    orderId ? (
      <ButtonLink href={`/orders/${orderId}`} size={size} fullWidth>
        View your order
      </ButtonLink>
    ) : (
      // Guests are sent to log in by the route guard, then come back to checkout.
      <ButtonLink href={`/checkout/${listingId}`} size={size} fullWidth>
        Buy
      </ButtonLink>
    );
  const similar = (
    <ButtonLink href={similarHref} fullWidth>
      See similar items
    </ButtonLink>
  );

  const errorLine = error && (
    <p role="alert" className="text-caption text-danger">
      {error}
    </p>
  );

  let panel;
  let bar;
  if (isOwner) {
    panel = (
      <div className="flex flex-col gap-3 rounded-md bg-accent-soft p-4">
        <p className="text-small font-medium text-brand-800">This is your listing.</p>
        <ButtonLink href={`/my-listings/${listingId}/edit`} fullWidth>
          Edit listing
        </ButtonLink>
        {status === "reserved" ? (
          <p className="text-caption text-fg-muted">
            Reserved for an order. Finish or cancel it in{" "}
            <TextLink href="/orders?role=selling">Orders</TextLink>
            .
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">{statusButtons()}</div>
        )}
        <TextLink href="/my-listings" className="self-start text-small font-medium">
          Go to My listings
        </TextLink>
      </div>
    );
    bar = (
      <>
        {status !== "reserved" && statusButtons()}
        <ButtonLink href={`/my-listings/${listingId}/edit`} fullWidth>
          Edit
        </ButtonLink>
      </>
    );
  } else if (active || orderId) {
    panel = (
      <div className="flex flex-col gap-2">
        {buyButton("lg")}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          {active ? chatButton : <span />}
          <FavoriteButton listingId={listingId} title={title} variant="full" />
        </div>
        <p className="text-caption text-fg-muted">
          {chatId
            ? "You already have a chat about this item."
            : "Buy with test-mode checkout, or ask questions and make an offer in the chat."}
        </p>
      </div>
    );
    bar = (
      <>
        {active && chatButton}
        {buyButton("md")}
      </>
    );
  } else {
    panel = (
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        {similar}
        <FavoriteButton listingId={listingId} title={title} variant="full" />
      </div>
    );
    bar = (
      <>
        <p className="flex-1 text-small font-medium">{UNAVAILABLE[status] ?? "Not available"}</p>
        <div className="shrink-0">
          <ButtonLink href={similarHref}>See similar items</ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="hidden flex-col gap-2 lg:flex">
        {panel}
        {errorLine}
      </div>
      {/* Phones: fixed to the bottom; the page leaves room for it (see the listing page). */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
        {errorLine}
        <div className="flex items-center gap-2">{bar}</div>
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.confirm?.title ?? ""}
        body={confirming?.confirm?.body ?? ""}
        action={confirming?.confirm?.action ?? ""}
        pending={busy !== null}
        onConfirm={() => confirming && void changeStatus(confirming)}
        onClose={() => busy === null && setConfirming(null)}
      />
    </>
  );
}

/** Quiet "Report this listing" link (not shown to the owner). */
export function ReportListingLink({ listingId, title }: { listingId: string; title: string }) {
  const session = useSession();
  const router = useRouter();
  const { isOwner } = useListingViewer();
  const [open, setOpen] = useState(false);
  if (isOwner) return null;
  return (
    <>
      <button
        type="button"
        onClick={() =>
          session === "guest"
            ? router.push(`/login?next=${encodeURIComponent(`/listing/${listingId}`)}`)
            : setOpen(true)
        }
        className="inline-flex min-h-8 shrink-0 items-center rounded-sm text-caption text-fg-muted underline-offset-2 hover:text-fg hover:underline"
      >
        Report listing
      </button>
      <ReportDialog open={open} target={{ type: "listing", listingId, label: title }} onClose={() => setOpen(false)} />
    </>
  );
}
