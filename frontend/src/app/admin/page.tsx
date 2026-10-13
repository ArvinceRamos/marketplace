"use client";

import Link from "next/link";
import { useAdminData, type AdminSummary } from "@/lib/admin";
import { AdminGate } from "./admin-gate";

const CARDS: { key: keyof AdminSummary; label: string; href?: string }[] = [
  { key: "open_reports", label: "Open reports", href: "/admin/reports" },
  { key: "escalated_disputes", label: "Disputes waiting for you", href: "/admin/disputes" },
  { key: "open_disputes", label: "Disputes waiting for sellers", href: "/admin/disputes?status=open" },
  { key: "restricted_users", label: "Restricted users", href: "/admin/users" },
  { key: "hidden_listings", label: "Hidden listings" },
  { key: "open_orders", label: "Open orders" },
];

export default function AdminOverview() {
  const { data, error, forbidden, reload } = useAdminData<AdminSummary>("/admin/summary");
  return (
    <AdminGate loading={!data} forbidden={forbidden} error={error} onRetry={reload}>
      {data && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CARDS.map((c) => {
            const body = (
              <>
                <span className="block text-display font-semibold" data-numeric>
                  {data[c.key]}
                </span>
                <span className="text-small text-fg-muted">{c.label}</span>
              </>
            );
            return (
              <li key={c.key}>
                {c.href ? (
                  <Link href={c.href} className="block rounded-md border border-border p-4 hover:bg-ink-50">
                    {body}
                  </Link>
                ) : (
                  <div className="rounded-md border border-border p-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdminGate>
  );
}
