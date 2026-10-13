"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FormAlert } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { INBOX_CHANGED } from "@/lib/safety";
import {
  listingNotice,
  personName,
  previewText,
  unreadBadge,
  type ConversationSummary,
  type Role,
} from "@/lib/social";
import { usePolling } from "@/lib/use-polling";

const FILTERS: { role: Role | null; label: string }[] = [
  { role: null, label: "All" },
  { role: "buying", label: "Buying" },
  { role: "selling", label: "Selling" },
];

const POLL_MS = 30_000;

export function InboxList({ activeId }: { activeId: string | null }) {
  const [role, setRole] = useState<Role | null>(null);
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<ConversationSummary[]>(`/conversations${role ? `?role=${role}` : ""}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your chats.");
    }
  }, [role]);
  usePolling(load, POLL_MS);

  // Blocking hides chats; unblocking brings them back. Reload at once.
  useEffect(() => {
    const reload = () => void load();
    window.addEventListener(INBOX_CHANGED, reload);
    return () => window.removeEventListener(INBOX_CHANGED, reload);
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Show chats" className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            aria-pressed={role === f.role}
            onClick={() => {
              setRole(f.role);
              setItems(null);
              apiFetch<ConversationSummary[]>(`/conversations${f.role ? `?role=${f.role}` : ""}`)
                .then(setItems)
                .catch(() => setError("Could not load your chats."));
            }}
            className={`min-h-9 rounded-full px-3 text-small font-medium ${
              role === f.role ? "bg-fg text-surface" : "bg-ink-100 text-fg hover:bg-ink-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <FormAlert message={error} />
      {!items && !error && <p aria-busy="true" className="text-small text-fg-muted">Loading…</p>}
      {items?.length === 0 && (
        <p className="rounded-md border border-dashed border-border-strong p-6 text-center text-small text-fg-muted">
          No chats yet. Open a listing and tap &ldquo;Chat with seller&rdquo;.
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((c) => {
            const badge = unreadBadge(c.unread_count);
            const notice = listingNotice(c.listing);
            return (
              <li key={c.id}>
                <Link
                  href={`/inbox/${c.id}`}
                  aria-current={c.id === activeId ? "page" : undefined}
                  className="flex gap-3 rounded-md p-2 hover:bg-ink-100 aria-[current=page]:bg-accent-soft"
                >
                  <div className="media-frame w-12 shrink-0">
                    {c.listing?.cover_thumb_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.listing.cover_thumb_url} alt="" loading="lazy" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-small ${badge ? "font-semibold" : "font-medium"}`}>
                        {personName(c.other_user)}
                      </span>
                      {c.last_message && (
                        <span className="shrink-0 text-caption text-fg-subtle">
                          {formatDateTime(c.last_message.at)}
                        </span>
                      )}
                    </div>
                    <span className="truncate text-caption text-fg-muted">
                      {c.listing?.title ?? "Listing removed"}
                      {notice && c.listing ? ` · ${c.listing.status}` : ""}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-caption ${badge ? "text-fg" : "text-fg-muted"}`}>
                        {previewText(c)}
                      </span>
                      {badge && (
                        <span className="shrink-0 rounded-full bg-danger px-1.5 text-caption leading-5 font-semibold text-white">
                          <span className="sr-only">Unread: </span>
                          {badge}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
