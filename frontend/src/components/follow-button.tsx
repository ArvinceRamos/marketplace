"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { followPath, followerText } from "@/lib/follows";
import type { Me } from "@/lib/profile";

/**
 * Follow/Following toggle plus the follower count. Hidden on your own profile.
 * Guests see the count and are sent to log in when they press Follow.
 */
export function FollowButton({ username, followers }: { username: string; followers: number }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // null = not known yet; "self" = the viewer's own profile.
  const [following, setFollowing] = useState<boolean | "self" | null>(null);
  // Our own follow/unfollow, added to the server count.
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session !== "user") return;
    let active = true;
    Promise.all([apiFetch<Me>("/me"), apiFetch<{ following: boolean }>(followPath(username))])
      .then(([me, state]) => {
        if (active) setFollowing(me.username === username ? "self" : state.following);
      })
      .catch(() => active && setFollowing(false));
    return () => {
      active = false;
    };
  }, [session, username]);

  const countText = <span className="text-small text-fg-muted">{followerText(Math.max(0, followers + delta))}</span>;
  if (following === "self") return countText;

  async function toggle() {
    if (session === "guest") {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const next = !following;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(followPath(username), { method: next ? "PUT" : "DELETE" });
      setFollowing(next);
      setDelta((d) => d + (next ? 1 : -1));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={following ? "secondary" : "primary"}
          aria-pressed={session === "user" ? following === true : undefined}
          disabled={busy || session === "loading" || (session === "user" && following === null)}
          onClick={toggle}
        >
          {following ? "Following" : "Follow"}
        </Button>
        {countText}
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
