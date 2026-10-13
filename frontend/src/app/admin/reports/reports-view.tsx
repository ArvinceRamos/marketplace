"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, TextArea } from "@/components/ui/field";
import { apiFetch } from "@/lib/api";
import { errorText, useAdminData, type AdminReport } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { REPORT_REASONS } from "@/lib/safety";
import { personName } from "@/lib/social";
import { AdminGate } from "../admin-gate";

const reasonLabel = (value: string) => REPORT_REASONS.find((r) => r.value === value)?.label ?? value;

export function ReportsView({ status }: { status: string }) {
  const { data, setData, error, forbidden, reload } = useAdminData<AdminReport[]>(
    `/admin/reports?status=${status}`,
  );
  return (
    <AdminGate loading={!data} forbidden={forbidden} error={error} onRetry={reload}>
      {data?.length === 0 && <p className="text-small text-fg-muted">No reports here.</p>}
      <ul className="flex flex-col gap-3">
        {data?.map((r) => (
          <li key={r.id}>
            <ReportCard
              report={r}
              onChanged={(next) =>
                // Leaves this filter once its status changes.
                setData((list) =>
                  (list ?? []).flatMap((x) => (x.id !== next.id ? [x] : next.status === status ? [next] : [])),
                )
              }
            />
          </li>
        ))}
      </ul>
    </AdminGate>
  );
}

function ReportCard({ report, onChanged }: { report: AdminReport; onChanged: (r: AdminReport) => void }) {
  const [note, setNote] = useState("");
  const [hide, setHide] = useState(false);
  const [restrict, setRestrict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = report.status === "actioned" || report.status === "dismissed";

  async function decide(status: "reviewing" | "actioned" | "dismissed") {
    setBusy(true);
    setError(null);
    try {
      const next = await apiFetch<AdminReport>(`/admin/reports/${report.id}`, {
        method: "POST",
        body: JSON.stringify({
          status,
          note: note || null,
          hide_listing: status === "actioned" && hide,
          restrict_user: status === "actioned" && restrict,
        }),
      });
      onChanged(next);
    } catch (e) {
      setError(errorText(e, "Could not save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const target =
    report.target_type === "listing" ? (
      report.listing ? (
        <>
          Listing{" "}
          <Link href={`/listing/${report.listing.id}`} className="font-medium underline">
            {report.listing.title}
          </Link>{" "}
          by @{report.listing.seller_username ?? "deleted"} · {report.listing.status}
          {report.listing.hidden && " · hidden"}
        </>
      ) : (
        "A listing that was deleted"
      )
    ) : report.user ? (
      <>
        User{" "}
        <Link href={`/seller/${report.user.username}`} className="font-medium underline">
          @{report.user.username}
        </Link>
        {report.user.restricted && " · restricted"}
      </>
    ) : (
      "A user who deleted their account"
    );

  return (
    <article className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-small font-semibold">{reasonLabel(report.reason)}</h2>
        <span className="text-caption text-fg-muted">
          {formatDateTime(report.created_at)} · by {personName(report.reporter)}
        </span>
      </div>
      <p className="text-small">{target}</p>
      {report.details && <p className="text-small text-fg-muted">&ldquo;{report.details}&rdquo;</p>}
      {!closed && (
        <div className="flex flex-col gap-3">
          <TextArea
            label="Note for the audit log (optional)"
            name={`note-${report.id}`}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-4 text-small">
            {report.listing && !report.listing.hidden && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
                Hide the listing
              </label>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={restrict}
                onChange={(e) => setRestrict(e.target.checked)}
              />
              Restrict the account
            </label>
          </div>
          <FormAlert message={error} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => decide("actioned")}>
              Take action
            </Button>
            {report.status === "open" && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide("reviewing")}>
                Mark reviewing
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide("dismissed")}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
