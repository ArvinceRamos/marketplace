"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, TextArea } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import {
  DISPUTE_REASON_LABELS,
  disputeLine,
  type DisputeReason,
  type OrderDetail,
} from "@/lib/orders";

type Post = (action: string, url: string, body?: unknown) => Promise<string | null>;

/**
 * Buyer protection for online orders: report a problem (holds the money), see the
 * dispute's state, and the seller's "contest" form. Refund / withdraw / escalate
 * are simple buttons on the order page.
 */
export function DisputePanel({ order, post }: { order: OrderDetail; post: Post }) {
  const canOpen = order.actions.includes("open_dispute");
  const canContest = order.actions.includes("dispute_contest");
  if (!order.dispute && !canOpen) return null;
  return (
    <section aria-labelledby="dispute-heading" className="flex flex-col gap-3">
      <h2 id="dispute-heading" className="text-title">
        {order.dispute ? "Problem report" : "Something wrong?"}
      </h2>
      {order.dispute ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-4 text-small">
          <p className="font-medium">{DISPUTE_REASON_LABELS[order.dispute.reason]}</p>
          {order.dispute.details && <p>&ldquo;{order.dispute.details}&rdquo;</p>}
          <p className="text-fg-muted">
            Reported {formatDateTime(order.dispute.created_at)}. {disputeLine(order.dispute, order.role)}
          </p>
          {order.dispute.seller_note && (
            <p>
              <span className="text-fg-muted">Seller: </span>
              {order.dispute.seller_note}
            </p>
          )}
          {order.dispute.admin_note && (
            <p>
              <span className="text-fg-muted">Moderator: </span>
              {order.dispute.admin_note}
            </p>
          )}
        </div>
      ) : (
        <OpenDisputeForm order={order} post={post} />
      )}
      {canContest && <ContestForm orderId={order.id} post={post} />}
    </section>
  );
}

function OpenDisputeForm({ order, post }: { order: OrderDetail; post: Post }) {
  // Not received only while in transit; the others once it has arrived.
  const reasons: DisputeReason[] =
    order.status === "shipped" ? ["not_received"] : ["not_as_described", "incomplete"];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason>(reasons[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-small text-fg-muted">
          Report a problem before you confirm. The money stays on hold while it&rsquo;s sorted
          out.
        </p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Report a problem
        </Button>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(await post("open_dispute", `/orders/${order.id}/dispute`, { reason, details: details || null }));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-border p-4" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-small font-medium">What&rsquo;s wrong?</legend>
        {reasons.map((r) => (
          <label key={r} className="flex items-center gap-2 text-small">
            <input
              type="radio"
              name="dispute-reason"
              checked={reason === r}
              onChange={() => setReason(r)}
              className="size-4 accent-[var(--color-accent)]"
            />
            {DISPUTE_REASON_LABELS[r]}
          </label>
        ))}
      </fieldset>
      <TextArea
        label="Details (optional)"
        name="dispute-details"
        rows={3}
        maxLength={1000}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        hint="The seller sees this, and a moderator if it goes further."
      />
      <FormAlert message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send report"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ContestForm({ orderId, post }: { orderId: string; post: Post }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) {
      setError("Tell the moderator what happened.");
      return;
    }
    setBusy(true);
    setError(await post("dispute_contest", `/orders/${orderId}/dispute/contest`, { note }));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <TextArea
        label="Disagree? Explain to the moderator"
        name="contest-note"
        rows={3}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <FormAlert message={error} />
      <Button type="submit" variant="secondary" disabled={busy} className="self-start">
        {busy ? "Sending…" : "Contest and ask a moderator"}
      </Button>
    </form>
  );
}
