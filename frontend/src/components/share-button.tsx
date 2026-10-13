"use client";

import { useState } from "react";
import { shareLink } from "@/lib/share";

const ICON = (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7" />
  </svg>
);

/**
 * Share this page (share sheet, or copy the link). `overlay` sits on a photo;
 * `outline` is a square 44px button next to other actions.
 */
export function ShareButton({
  path,
  title,
  label = "Share",
  variant = "outline",
}: {
  /** Site path, e.g. /listing/123; the origin is added in the browser. */
  path: string;
  title: string;
  label?: string;
  variant?: "overlay" | "outline";
}) {
  const [note, setNote] = useState<string | null>(null);

  async function onClick() {
    const result = await shareLink(`${window.location.origin}${path}`, title);
    setNote(result === "copied" ? "Link copied" : result === "failed" ? "Couldn't share. Copy the address bar." : null);
    if (result !== "shared") setTimeout(() => setNote(null), 2500);
  }

  const look =
    variant === "overlay"
      ? "size-11 rounded-full bg-surface/90 shadow-sm hover:bg-surface"
      : "size-11 rounded-sm border border-border-strong bg-surface hover:bg-ink-100";
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={onClick} aria-label={label} className={`grid shrink-0 place-items-center text-fg ${look}`}>
        {ICON}
      </button>
      <span
        role="status"
        className={`pointer-events-none absolute top-full right-0 z-10 mt-1 rounded-sm bg-ink-950 px-2 py-1 text-caption whitespace-nowrap text-white ${note ? "" : "sr-only"}`}
      >
        {note ?? ""}
      </span>
    </span>
  );
}
