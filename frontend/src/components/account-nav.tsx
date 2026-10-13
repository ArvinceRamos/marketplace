"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFavorites } from "@/components/providers";
import { SignOutButton } from "@/components/sign-out-button";

export const ACCOUNT_LINKS = [
  { href: "/profile", label: "Profile" },
  { href: "/my-listings", label: "My listings" },
  { href: "/orders", label: "Orders" },
  { href: "/favorites", label: "Saved items" },
  { href: "/wallet", label: "Wallet" },
  { href: "/settings", label: "Settings" },
] as const;

/** Desktop sidebar for the profile pages. Phones use the header's Account menu. */
export function AccountSidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Your account" className="hidden flex-col gap-1 lg:flex">
      {ACCOUNT_LINKS.map((l) => {
        const current = pathname === l.href || (l.href === "/profile" && pathname.startsWith("/profile/"));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-sm px-3 text-small font-medium ${
              current ? "bg-ink-100 text-fg" : "text-fg-muted hover:bg-ink-50 hover:text-fg"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
      <div className="my-2 border-t border-border" />
      <SignOutButton className="justify-start px-3" />
    </nav>
  );
}

/** Phones: account shortcuts as 56px rows under the profile. */
export function AccountShortcuts({ activeListings }: { activeListings: number | null }) {
  const { ids } = useFavorites();
  const meta: Partial<Record<string, string>> = {
    "/my-listings": activeListings === null ? undefined : activeListings ? `${activeListings} active` : "None yet",
    "/favorites": ids && ids.size > 0 ? String(ids.size) : undefined,
  };
  return (
    <ul className="-mx-4 flex flex-col divide-y divide-border border-y border-border lg:hidden">
      {ACCOUNT_LINKS.filter((l) => l.href !== "/profile").map((l) => (
        <li key={l.href}>
          <Link href={l.href} className="flex min-h-14 items-center gap-3 px-4 text-body hover:bg-surface-muted">
            <span className="flex-1">{l.label}</span>
            {meta[l.href] && <span className="text-small text-fg-muted">{meta[l.href]}</span>}
            <svg viewBox="0 0 24 24" aria-hidden className="size-5 text-fg-subtle" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        </li>
      ))}
      <li>
        <SignOutButton className="min-h-14 w-full justify-start rounded-none px-4 text-body text-danger hover:text-danger" />
      </li>
    </ul>
  );
}
