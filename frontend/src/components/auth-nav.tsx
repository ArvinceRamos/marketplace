"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "@/components/providers";
import { SignOutButton } from "@/components/sign-out-button";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { unreadBadge } from "@/lib/social";
import { usePolling } from "@/lib/use-polling";

const UNREAD_POLL_MS = 30_000;

export function AuthNav() {
  const session = useSession();

  if (session === "loading") return <div className="h-11 w-36" aria-hidden />;
  if (session === "guest") {
    return (
      <nav aria-label="Account" className="flex items-center gap-2">
        {/* Phones: no room; the sell page asks guests to log in anyway. */}
        <ButtonLink href="/sell" variant="secondary" className="max-sm:hidden">
          Sell
        </ButtonLink>
        <ButtonLink href="/login" variant="ghost">
          Log in
        </ButtonLink>
        <ButtonLink href="/register">Register</ButtonLink>
      </nav>
    );
  }
  return (
    <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
      <ButtonLink href="/sell">Sell</ButtonLink>
      <InboxLink />
      <AccountMenu />
    </nav>
  );
}

function InboxLink() {
  const [unread, setUnread] = useState(0);
  usePolling(async () => {
    try {
      setUnread((await apiFetch<{ unread: number }>("/me/unread-count")).unread);
    } catch {
      // Keep the last value; the badge is a hint, not critical.
    }
  }, UNREAD_POLL_MS);
  const badge = unreadBadge(unread);
  return (
    <Link
      href="/inbox"
      className={`${buttonClasses({ variant: "ghost" })} relative`}
      aria-label={badge ? `Inbox, ${unread} unread` : "Inbox"}
    >
      Inbox
      {badge && (
        <span
          aria-hidden
          className="min-w-5 rounded-full bg-danger px-1.5 text-center text-caption leading-5 font-semibold text-white"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

const menuLink = "block rounded-sm px-3 py-2.5 text-small text-fg hover:bg-ink-100";

/** A small disclosure menu (<details>): works without extra JavaScript and with the keyboard. */
function AccountMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  // Close after navigating, and when this page is hidden by navigation.
  useLayoutEffect(() => {
    const details = ref.current;
    if (details) details.open = false;
    return () => {
      if (details) details.open = false;
    };
  }, [pathname]);
  // Close on a click outside or Esc, like other menus.
  useEffect(() => {
    const close = (event: Event) => {
      const details = ref.current;
      if (!details?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        className={`${buttonClasses({ variant: "ghost" })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        Account <span aria-hidden>▾</span>
      </summary>
      <div className="absolute right-0 z-30 mt-1 flex w-48 flex-col rounded-md border border-border bg-surface p-1 shadow-lg">
        <Link href="/profile" className={menuLink}>
          Profile
        </Link>
        <Link href="/my-listings" className={menuLink}>
          My listings
        </Link>
        <Link href="/favorites" className={menuLink}>
          Saved items
        </Link>
        <div className="my-1 border-t border-border" />
        <SignOutButton className="justify-start" />
      </div>
    </details>
  );
}
