"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/providers";
import { ReportDialog } from "@/components/safety/report-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MoreMenu, moreMenuItem } from "@/components/ui/more-menu";
import { ApiError, apiFetch } from "@/lib/api";
import type { Me } from "@/lib/profile";
import { INBOX_CHANGED, type BlockedUser } from "@/lib/safety";

type Props = {
  username: string;
  /** Display name for dialogs. */
  name: string;
  /** Known block state (the chat has it). Left out: asked from the API. */
  blocked?: boolean;
  onChange?: (blocked: boolean) => void;
};

/**
 * "•••" menu with Report user and Block/Unblock user. Hidden on your own profile.
 * Guests are sent to log in first.
 */
export function UserSafetyMenu({ username, name, blocked: known, onChange }: Props) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // null = loading; "self" = this is the viewer's own profile.
  const [loaded, setLoaded] = useState<{ blocked: boolean } | "self" | null>(null);
  const [dialog, setDialog] = useState<"report" | "block" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session !== "user" || known !== undefined) return;
    let active = true;
    Promise.all([apiFetch<Me>("/me"), apiFetch<BlockedUser[]>("/me/blocks")])
      .then(([me, blocks]) => {
        if (!active) return;
        if (me.username === username) setLoaded("self");
        else setLoaded({ blocked: blocks.some((b) => b.username === username) });
      })
      .catch(() => active && setLoaded({ blocked: false }));
    return () => {
      active = false;
    };
  }, [session, known, username]);

  if (session === "loading" || loaded === "self") return null;
  if (session === "user" && known === undefined && loaded === null) return null;
  const blocked = known ?? loaded?.blocked ?? false;

  function choose(action: "report" | "block") {
    if (session === "guest") {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setError(null);
    setDialog(action);
  }

  async function setBlocked(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/users/${encodeURIComponent(username)}/block`, {
        method: next ? "PUT" : "DELETE",
      });
      setLoaded({ blocked: next });
      setDialog(null);
      window.dispatchEvent(new Event(INBOX_CHANGED));
      onChange?.(next);
    } catch (e) {
      setDialog(null);
      setError(e instanceof ApiError ? e.message : "Could not update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <MoreMenu label={`More actions for @${username}`}>
        <button type="button" data-menu-item className={moreMenuItem} onClick={() => choose("report")}>
          Report user
        </button>
        {blocked ? (
          <button
            type="button"
            data-menu-item
            className={moreMenuItem}
            disabled={busy}
            onClick={() => void setBlocked(false)}
          >
            Unblock user
          </button>
        ) : (
          <button
            type="button"
            data-menu-item
            className={`${moreMenuItem} text-danger`}
            onClick={() => choose("block")}
          >
            Block user
          </button>
        )}
      </MoreMenu>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <ReportDialog
        open={dialog === "report"}
        target={{ type: "user", username, label: `${name} (@${username})` }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "block"}
        title={`Block ${name}?`}
        body="They won't be able to message you or send offers, and you won't be able to message them. Your chats with them will be hidden from your inbox. You can unblock them anytime in Settings."
        action="Block"
        variant="danger"
        pending={busy}
        onConfirm={() => void setBlocked(true)}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
