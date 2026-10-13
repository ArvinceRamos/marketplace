"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError, apiFetch } from "@/lib/api";
import {
  DELETE_CONFIRM,
  STATUS_ACTIONS,
  type ListingStatus,
  type StatusAction,
} from "@/lib/selling";

type Pending = { kind: "status"; action: StatusAction } | { kind: "delete" };

/** Status buttons for a seller's own listing, plus Delete. Asks first where it matters. */
export function ListingActions({
  listingId,
  status,
  onDone,
}: {
  listingId: string;
  status: ListingStatus;
  onDone: (next: ListingStatus | "deleted") => void;
}) {
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(pending: Pending) {
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === "delete") {
        await apiFetch(`/listings/${listingId}`, { method: "DELETE" });
        onDone("deleted");
      } else {
        await apiFetch(`/listings/${listingId}/status`, {
          method: "POST",
          body: JSON.stringify({ status: pending.action.to }),
        });
        onDone(pending.action.to);
      }
      setConfirming(null);
    } catch (e) {
      setConfirming(null);
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function start(pending: Pending) {
    const needsConfirm = pending.kind === "delete" || pending.action.confirm;
    if (needsConfirm) setConfirming(pending);
    else void run(pending);
  }

  const dialog =
    confirming?.kind === "delete"
      ? { ...DELETE_CONFIRM, variant: "danger" as const }
      : confirming?.kind === "status" && confirming.action.confirm
        ? { ...confirming.action.confirm, variant: "primary" as const }
        : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {STATUS_ACTIONS[status].map((action) => (
          <Button
            key={action.to}
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => start({ kind: "status", action })}
          >
            {action.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="text-danger hover:text-danger"
          disabled={busy}
          onClick={() => start({ kind: "delete" })}
        >
          Delete
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.title ?? ""}
        body={dialog?.body ?? ""}
        action={dialog?.action ?? ""}
        variant={dialog?.variant}
        pending={busy}
        onConfirm={() => confirming && void run(confirming)}
        onClose={() => !busy && setConfirming(null)}
      />
    </div>
  );
}
