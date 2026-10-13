"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormAlert, TextArea } from "@/components/ui/field";
import { apiFetch } from "@/lib/api";
import { errorText, useAdminData, type AdminDispute } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { DISPUTE_REASON_LABELS, formatMoney } from "@/lib/orders";
import { AdminGate } from "../admin-gate";

export function DisputesView({ status }: { status: string }) {
  const { data, setData, error, forbidden, reload } = useAdminData<AdminDispute[]>(
    `/admin/disputes?status=${status}`,
  );
  return (
    <AdminGate loading={!data} forbidden={forbidden} error={error} onRetry={reload}>
      {data?.length === 0 && <p className="text-small text-fg-muted">No disputes here.</p>}
      <ul className="flex flex-col gap-3">
        {data?.map((d) => (
          <li key={d.id}>
            <DisputeCard
              dispute={d}
              onResolved={(next) => setData((list) => (list ?? []).filter((x) => x.id !== next.id))}
            />
          </li>
        ))}
      </ul>
    </AdminGate>
  );
}

type Outcome = "refund_buyer" | "release_seller";

function DisputeCard({
  dispute,
  onResolved,
}: {
  dispute: AdminDispute;
  onResolved: (d: AdminDispute) => void;
}) {
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { order } = dispute;

  function ask(outcome: Outcome) {
    if (!note.trim()) {
      setError("Write a short note explaining the decision. Both sides will see it.");
      return;
    }
    setError(null);
    setConfirming(outcome);
  }

  async function resolve() {
    if (!confirming) return;
    setBusy(true);
    try {
      onResolved(
        await apiFetch<AdminDispute>(`/admin/disputes/${dispute.id}/resolve`, {
          method: "POST",
          body: JSON.stringify({ outcome: confirming, note }),
        }),
      );
    } catch (e) {
      setError(errorText(e, "Could not save the decision."));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-small font-semibold">{order.title}</h2>
        <span className="text-caption text-fg-muted">Reported {formatDateTime(dispute.created_at)}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
        <dt className="text-fg-muted">Buyer</dt>
        <dd>@{order.buyer ?? "deleted"}</dd>
        <dt className="text-fg-muted">Seller</dt>
        <dd>@{order.seller ?? "deleted"}</dd>
        <dt className="text-fg-muted">Amount held</dt>
        <dd>
          {formatMoney(order.total_centavos)} (item {formatMoney(order.item_price_centavos)})
        </dd>
        <dt className="text-fg-muted">Delivery</dt>
        <dd>
          {order.delivered_at
            ? `Delivered ${formatDateTime(order.delivered_at)}`
            : order.shipped_at
              ? `Shipped ${formatDateTime(order.shipped_at)}, not delivered`
              : order.fulfilment}
        </dd>
        <dt className="text-fg-muted">Problem</dt>
        <dd>{DISPUTE_REASON_LABELS[dispute.reason]}</dd>
        {dispute.details && (
          <>
            <dt className="text-fg-muted">Buyer says</dt>
            <dd>&ldquo;{dispute.details}&rdquo;</dd>
          </>
        )}
        <dt className="text-fg-muted">Seller says</dt>
        <dd>{dispute.seller_note ? `“${dispute.seller_note}”` : "No answer"}</dd>
        {dispute.admin_note && (
          <>
            <dt className="text-fg-muted">Decision</dt>
            <dd>
              {dispute.outcome} · &ldquo;{dispute.admin_note}&rdquo;
            </dd>
          </>
        )}
      </dl>
      {dispute.status !== "resolved" && (
        <div className="flex flex-col gap-3">
          {dispute.status === "open" && (
            <p className="text-caption text-fg-muted">
              The seller can still answer until{" "}
              {dispute.respond_by ? formatDateTime(dispute.respond_by) : "the deadline"}. You can
              decide now anyway.
            </p>
          )}
          <TextArea
            label="Decision note (shown to both sides)"
            name={`decision-${dispute.id}`}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <FormAlert message={error} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" disabled={busy} onClick={() => ask("refund_buyer")}>
              Refund buyer
            </Button>
            <Button size="sm" disabled={busy} onClick={() => ask("release_seller")}>
              Release to seller
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "refund_buyer" ? "Refund the buyer?" : "Release to the seller?"}
        body={
          confirming === "refund_buyer"
            ? `${formatMoney(order.total_centavos)} goes back to the buyer. This is final.`
            : `${formatMoney(order.item_price_centavos)} goes to the seller's wallet. This is final.`
        }
        action={confirming === "refund_buyer" ? "Refund buyer" : "Release to seller"}
        variant={confirming === "refund_buyer" ? "danger" : "primary"}
        pending={busy}
        onConfirm={resolve}
        onClose={() => setConfirming(null)}
      />
    </article>
  );
}
