"use client";

import { ACTION_LABELS, useAdminData, type AdminAction } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { personName } from "@/lib/social";
import { AdminGate } from "../admin-gate";

/** Every moderator action, newest first. Written by the database in the same transaction. */
export default function AdminLogPage() {
  const { data, error, forbidden, reload } = useAdminData<AdminAction[]>("/admin/actions");
  return (
    <AdminGate loading={!data} forbidden={forbidden} error={error} onRetry={reload}>
      {data?.length === 0 && <p className="text-small text-fg-muted">No actions yet.</p>}
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {data?.map((a) => (
          <li key={a.id} className="flex flex-col gap-0.5 p-3">
            <p className="text-small">
              <span className="font-medium">{personName(a.admin)}</span>{" "}
              {(ACTION_LABELS[a.action] ?? a.action).toLowerCase()}
            </p>
            <p className="text-caption text-fg-muted">
              {formatDateTime(a.created_at)} · {a.target_type}{" "}
              <span className="font-mono">{a.target_id?.slice(0, 8)}</span>
              {a.note && ` · “${a.note}”`}
            </p>
          </li>
        ))}
      </ul>
    </AdminGate>
  );
}
