"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { SignOutButton } from "@/components/sign-out-button";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert, TextField } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Me } from "@/lib/profile";
import {
  INBOX_CHANGED,
  REPORT_REASONS,
  REPORT_STATUS_LABELS,
  confirmsUsername,
  reportTargetLabel,
  type BlockedUser,
  type Report,
} from "@/lib/safety";
import { personName } from "@/lib/social";
import { createClient } from "@/lib/supabase/client";

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function SettingsView() {
  const [me, setMe] = useState<Me | null>(null);
  const [blocks, setBlocks] = useState<BlockedUser[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  // Runs again when this page becomes visible after navigating away.
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<Me>("/me"),
      apiFetch<BlockedUser[]>("/me/blocks"),
      apiFetch<Report[]>("/me/reports"),
    ])
      .then(([m, b, r]) => {
        if (!active) return;
        setMe(m);
        setBlocks(b);
        setReports(r);
      })
      .catch((e: unknown) => active && setError(errorText(e, "Could not load your settings.")));
    return () => {
      active = false;
    };
  }, []);

  // Pages stay mounted (hidden) after navigation. Drop account data when hidden,
  // so it isn't kept around after logging out on a shared device.
  useLayoutEffect(
    () => () => {
      setMe(null);
      setBlocks(null);
      setReports(null);
      setError(null);
    },
    [],
  );

  if (deleted) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <p className="text-body">Your account was deleted. Thank you for using Marketplace.</p>
        <ButtonLink href="/">Go to the homepage</ButtonLink>
      </div>
    );
  }
  if (error) return <FormAlert message={error} />;
  if (!me || !blocks || !reports) {
    return (
      <div aria-busy="true" aria-label="Loading settings" className="flex flex-col gap-3">
        <div className="h-6 w-48 animate-pulse rounded-sm bg-ink-100" />
        <div className="h-20 w-full animate-pulse rounded-md bg-ink-100" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <BlockedUsers blocks={blocks} onChange={setBlocks} />
      <MyReports reports={reports} />
      <section aria-labelledby="session-heading" className="flex flex-col gap-3">
        <h2 id="session-heading" className="text-title">
          Session
        </h2>
        <p className="text-small text-fg-muted">
          Signed in as {me.email ?? `@${me.username}`}. Log out on shared devices.
        </p>
        <SignOutButton variant="secondary" className="self-start" />
      </section>
      <DeleteAccount username={me.username} onDeleted={() => setDeleted(true)} />
    </div>
  );
}

function BlockedUsers({
  blocks,
  onChange,
}: {
  blocks: BlockedUser[];
  onChange: (next: BlockedUser[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unblock(username: string) {
    setBusy(username);
    setError(null);
    try {
      await apiFetch(`/users/${encodeURIComponent(username)}/block`, { method: "DELETE" });
      onChange(blocks.filter((b) => b.username !== username));
      window.dispatchEvent(new Event(INBOX_CHANGED));
    } catch (e) {
      setError(errorText(e, "Could not unblock. Try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="blocked-heading" className="flex flex-col gap-3">
      <h2 id="blocked-heading" className="text-title">
        Blocked users
      </h2>
      <p className="text-small text-fg-muted">
        Blocked users can&apos;t message you or send offers, and your chats with them are hidden.
      </p>
      <FormAlert message={error} />
      {blocks.length === 0 ? (
        <p className="rounded-md border border-dashed border-border-strong p-4 text-small text-fg-muted">
          You haven&apos;t blocked anyone.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {blocks.map((b) => (
            <li key={b.username} className="flex items-center gap-3 p-3">
              <Avatar name={personName(b)} url={b.avatar_url} />
              <div className="flex min-w-0 flex-col">
                <Link href={`/seller/${b.username}`} className="truncate text-small font-medium hover:underline">
                  {personName(b)}
                </Link>
                <span className="text-caption text-fg-muted">
                  @{b.username} · blocked {formatDate(b.blocked_at)}
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto"
                disabled={busy !== null}
                onClick={() => void unblock(b.username)}
                aria-label={`Unblock @${b.username}`}
              >
                {busy === b.username ? "Unblocking…" : "Unblock"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

function MyReports({ reports }: { reports: Report[] }) {
  return (
    <section aria-labelledby="reports-heading" className="flex flex-col gap-3">
      <h2 id="reports-heading" className="text-title">
        Your reports
      </h2>
      {reports.length === 0 ? (
        <p className="text-small text-fg-muted">
          You haven&apos;t reported anything. Use &ldquo;Report&rdquo; on a listing, profile, or chat.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-3">
              <span className="min-w-0 truncate text-small font-medium">{reportTargetLabel(r)}</span>
              <span className="text-caption text-fg-muted">
                {REASON_LABELS[r.reason]} · {formatDate(r.created_at)} ·{" "}
                <span className="font-medium text-fg">{REPORT_STATUS_LABELS[r.status]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeleteAccount({ username, onDeleted }: { username: string; onDeleted: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirmsUsername(typed, username);

  // Pages stay mounted (hidden) after navigation; don't keep a half-typed confirmation.
  useLayoutEffect(
    () => () => {
      setTyped("");
      setError(null);
    },
    [],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/me", { method: "DELETE", body: JSON.stringify({ confirm_username: typed.trim() }) });
    } catch (e) {
      setError(errorText(e, "Could not delete your account. Try again."));
      setBusy(false);
      return;
    }
    setTyped("");
    // The Auth user is gone; only the local session needs clearing.
    await createClient().auth.signOut({ scope: "local" });
    onDeleted();
  }

  return (
    <section
      aria-labelledby="delete-heading"
      className="flex flex-col gap-3 rounded-md border border-danger/40 p-4"
    >
      <h2 id="delete-heading" className="text-title text-danger">
        Delete account
      </h2>
      <p className="text-small text-fg-muted">
        This permanently deletes your profile, listings and their photos, chats about your listings,
        saved items, blocks, and reports. Chats where you were the buyer stay with the seller and
        show &ldquo;Deleted user&rdquo;. This can&apos;t be undone.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <TextField
          label={`Type your username (${username}) to confirm`}
          name="confirm_username"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <FormAlert message={error} />
        <Button type="submit" variant="danger" className="self-start" disabled={!matches || busy}>
          {busy ? "Deleting…" : "Delete my account"}
        </Button>
      </form>
    </section>
  );
}
