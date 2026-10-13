"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormAlert, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api";
import { errorText, useAdminData, type AdminUser } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { AdminGate } from "../admin-gate";

export default function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const { data, setData, error, forbidden, reload } = useAdminData<AdminUser[]>(
    `/admin/users?q=${encodeURIComponent(search)}`,
  );
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSearch(query.trim().replace(/^@/, "").toLowerCase());
  }

  async function toggle() {
    if (!target) return;
    setBusy(true);
    setActionError(null);
    try {
      const next = await apiFetch<AdminUser>(`/admin/users/${target.username}/restriction`, {
        method: "POST",
        body: JSON.stringify({ restricted: !target.restricted_at, note: note || null }),
      });
      setData((list) => (list ?? []).map((u) => (u.username === next.username ? next : u)));
      setNote("");
    } catch (e) {
      setActionError(errorText(e, "Could not save."));
    } finally {
      setBusy(false);
      setTarget(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex items-end gap-2" role="search">
        <div className="flex-1">
          <TextField
            label="Find a user by username"
            name="admin-user-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={31}
            autoComplete="off"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>
      <p className="text-caption text-fg-muted">
        {search ? `Usernames starting with “${search}”.` : "Restricted accounts first, then the newest."}
      </p>
      <FormAlert message={actionError} />
      <AdminGate loading={!data} forbidden={forbidden} error={error} onRetry={reload}>
        {data?.length === 0 && <p className="text-small text-fg-muted">No users found.</p>}
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {data?.map((u) => (
            <li key={u.username} className="flex flex-wrap items-center gap-3 p-3">
              <Avatar name={u.display_name ?? u.username} url={u.avatar_url} />
              <div className="min-w-0 flex-1">
                <Link href={`/seller/${u.username}`} className="text-small font-medium hover:underline">
                  @{u.username}
                </Link>
                <p className="text-caption text-fg-muted">
                  Joined {formatDate(u.joined_at)} · {u.active_listings} active ·{" "}
                  {u.open_reports} open report{u.open_reports === 1 ? "" : "s"}
                  {u.restricted_at && ` · restricted since ${formatDate(u.restricted_at)}`}
                </p>
              </div>
              <Button
                size="sm"
                variant={u.restricted_at ? "secondary" : "danger"}
                onClick={() => setTarget(u)}
              >
                {u.restricted_at ? "Lift restriction" : "Restrict"}
              </Button>
            </li>
          ))}
        </ul>
      </AdminGate>
      <ConfirmDialog
        open={target !== null}
        title={target?.restricted_at ? `Lift @${target?.username}'s restriction?` : `Restrict @${target?.username}?`}
        body={
          target?.restricted_at
            ? "They can list, chat, offer, and buy again."
            : "They can still finish open orders, but can't list, chat, offer, or buy. Others see a warning."
        }
        action={target?.restricted_at ? "Lift restriction" : "Restrict"}
        variant={target?.restricted_at ? "primary" : "danger"}
        pending={busy}
        onConfirm={toggle}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
