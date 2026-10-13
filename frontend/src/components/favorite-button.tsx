"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useFavorites, useSession } from "@/components/providers";
import { ApiError } from "@/lib/api";

/**
 * Heart toggle. Guests are sent to log in and come back here.
 * `overlay` sits on a card photo; `round` is the same circle (44px) placed by its parent
 * (listing gallery); `full` is a labelled button on the listing page.
 */
export function FavoriteButton({
  listingId,
  title,
  variant = "overlay",
}: {
  listingId: string;
  title: string;
  variant?: "overlay" | "round" | "full";
}) {
  const session = useSession();
  const { ids, toggle } = useFavorites();
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const saved = ids?.has(listingId) ?? false;

  async function onClick() {
    if (session === "guest") {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setError(null);
    try {
      await toggle(listingId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save. Try again.");
    }
  }

  const heart = (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill={saved ? "currentColor" : "none"}>
      <path
        d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 3.4 0 5.7 3.3 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variant === "round") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={session === "loading"}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
        title={error ?? undefined}
        className={`grid size-11 place-items-center rounded-full bg-surface/90 shadow-sm hover:bg-surface ${
          saved ? "text-danger" : "text-fg"
        }`}
      >
        {heart}
      </button>
    );
  }
  if (variant === "overlay") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={session === "loading"}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
        title={error ?? undefined}
        // z-10: above the card's full-size link.
        className={`absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-full bg-surface/90 shadow-sm hover:bg-surface ${
          saved ? "text-danger" : "text-fg"
        }`}
      >
        {heart}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={session === "loading"}
        aria-pressed={saved}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface px-4 text-small font-medium hover:bg-ink-100 ${
          saved ? "text-danger" : "text-fg"
        }`}
      >
        {heart}
        {saved ? "Saved" : "Save"}
      </button>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
