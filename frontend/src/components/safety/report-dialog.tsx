"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api";
import {
  DETAILS_MAX,
  REPORT_REASONS,
  reportBody,
  type ReportReason,
  type ReportTarget,
} from "@/lib/safety";

type Props = { open: boolean; target: ReportTarget; onClose: () => void };

/**
 * Report a listing or a user: pick a reason, optionally add details. Native <dialog>
 * (focus trap, Esc, focus returns to the opener). Starts empty every time it opens.
 */
export function ReportDialog({ open, target, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setReason(null);
      setDetails("");
      setError(null);
      setDone(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Pages stay mounted (hidden) after navigation; never come back to an open dialog.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useLayoutEffect(() => () => onCloseRef.current(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason) {
      setError("Choose a reason.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/reports", {
        method: "POST",
        body: JSON.stringify(reportBody(target, reason, details)),
      });
      setDone("Thanks. We received your report and will look into it.");
    } catch (e) {
      if (e instanceof ApiError && e.code === "already_reported") setDone(e.message);
      else setError(e instanceof ApiError ? e.message : "Could not send the report. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const what = target.type === "listing" ? "listing" : "user";
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-border bg-surface p-0 text-fg shadow-lg backdrop:bg-ink-950/50"
    >
      <div className="flex max-h-[calc(100dvh-4rem)] flex-col gap-4 overflow-y-auto p-6">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-title">
            Report {what}
          </h2>
          <p className="truncate text-small text-fg-muted">{target.label}</p>
        </div>
        {done ? (
          <>
            <p role="status" className="text-body">
              {done}
            </p>
            <p className="text-small text-fg-muted">
              If someone is pressuring you or you already lost money, stop replying and keep your
              chat history. You can also block this person.
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose} autoFocus>
                Done
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-small font-medium">Why are you reporting this {what}?</legend>
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex cursor-pointer items-start gap-3 rounded-sm border border-border px-3 py-2.5 has-checked:border-accent has-checked:bg-accent-soft"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-0.5 size-5 shrink-0 accent-accent"
                  />
                  <span className="flex flex-col">
                    <span className="text-small font-medium">{r.label}</span>
                    <span className="text-caption text-fg-muted">{r.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${titleId}-details`} className="text-small font-medium">
                Details <span className="font-regular text-fg-muted">(optional)</span>
              </label>
              <textarea
                id={`${titleId}-details`}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={DETAILS_MAX}
                rows={3}
                className="min-h-20 w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-body focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-accent"
              />
              <p className="text-caption text-fg-muted">
                What happened? Don&apos;t include passwords or bank details.
              </p>
            </div>
            <FormAlert message={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send report"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
