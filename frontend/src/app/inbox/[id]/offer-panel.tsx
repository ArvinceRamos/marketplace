"use client";

import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { parsePesos } from "@/lib/selling";
import { personName, type ConversationDetail } from "@/lib/social";

type Action = "accept" | "reject" | "withdraw";

/**
 * Offer controls for the current chat. Buyers make or withdraw an offer; sellers
 * accept or decline it. The server decides who may do what; these buttons only
 * appear where they would work.
 */
export function OfferPanel({
  detail,
  onChanged,
}: {
  detail: ConversationDetail;
  onChanged: () => Promise<void>;
}) {
  const [making, setMaking] = useState(false);
  const [amount, setAmount] = useState("");
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = detail.latest_offer?.status === "pending" ? detail.latest_offer : null;
  const buyer = detail.role === "buying";

  async function run(path: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(path, init);
      await onChanged();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      await onChanged();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function respond(action: Action) {
    if (!pending) return;
    await run(`/offers/${pending.id}/${action}`, { method: "POST" });
    setConfirmAccept(false);
  }

  async function makeOffer(event: FormEvent) {
    event.preventDefault();
    const centavos = parsePesos(amount);
    if (!centavos) {
      setError("Enter an amount in pesos, e.g. 1500.");
      return;
    }
    const ok = await run(`/conversations/${detail.id}/offers`, {
      method: "POST",
      body: JSON.stringify({ amount_centavos: centavos }),
    });
    if (ok) {
      setMaking(false);
      setAmount("");
    }
  }

  const errorLine = error && (
    <p role="alert" className="text-caption text-danger">
      {error}
    </p>
  );

  if (pending && buyer) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-accent-soft p-3">
          <p className="text-small">
            Your offer of <strong data-numeric>{formatPrice(pending.amount_centavos)}</strong> is
            waiting for the seller.
          </p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => respond("withdraw")}>
            Withdraw
          </Button>
        </div>
        {errorLine}
      </div>
    );
  }

  if (pending && !buyer) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-accent-soft p-3">
          <p className="text-small">
            {personName(detail.other_user)} offered{" "}
            <strong data-numeric>{formatPrice(pending.amount_centavos)}</strong>
            {detail.listing && (
              <span className="text-fg-muted">
                {" "}
                (asking {formatPrice(detail.listing.price_centavos)})
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => respond("reject")}>
              Decline
            </Button>
            <Button size="sm" disabled={busy} onClick={() => setConfirmAccept(true)}>
              Accept
            </Button>
          </div>
        </div>
        {errorLine}
        <ConfirmDialog
          open={confirmAccept}
          title={`Accept ${formatPrice(pending.amount_centavos)}?`}
          body="The buyer can then buy it at this price with checkout, or you can agree on payment and meetup in this chat and mark the item as sold when the deal is done."
          action="Accept offer"
          pending={busy}
          onConfirm={() => respond("accept")}
          onClose={() => !busy && setConfirmAccept(false)}
        />
      </div>
    );
  }

  // An accepted offer can be bought at its price with test-mode checkout.
  const accepted =
    buyer && detail.latest_offer?.status === "accepted" && detail.listing?.status === "active"
      ? detail.latest_offer
      : null;
  const buyBanner = accepted && detail.listing && (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-success-soft p-3">
      <p className="text-small">
        Your offer of <strong data-numeric>{formatPrice(accepted.amount_centavos)}</strong> was
        accepted.
      </p>
      <ButtonLink size="sm" href={`/checkout/${detail.listing.id}?offer=${accepted.id}`}>
        Buy at {formatPrice(accepted.amount_centavos)}
      </ButtonLink>
    </div>
  );

  if (!detail.can_offer) return buyBanner || errorLine || null;

  if (!making) {
    return (
      <div className="flex flex-col gap-2">
        {buyBanner}
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setMaking(true)}>
          Make an offer
        </Button>
        {errorLine}
      </div>
    );
  }
  return (
    <form onSubmit={makeOffer} className="flex flex-col gap-2 rounded-md bg-surface-muted p-3">
      <label htmlFor="offer-amount" className="text-small font-medium">
        Your offer (₱)
        {detail.listing && (
          <span className="font-regular text-fg-muted">
            {" "}
            · asking {formatPrice(detail.listing.price_centavos)}
          </span>
        )}
      </label>
      <div className="flex gap-2">
        <input
          id="offer-amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 1500"
          className="min-h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-body focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-accent"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send offer"}
        </Button>
        <Button variant="ghost" onClick={() => setMaking(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
      <p className="text-caption text-fg-muted">The seller can accept or decline. Offers expire after 7 days.</p>
      {errorLine}
    </form>
  );
}
