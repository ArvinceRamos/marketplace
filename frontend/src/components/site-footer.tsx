import Link from "next/link";

const LINKS = [
  { href: "/safety", label: "Safety tips" },
  { href: "/terms", label: "Terms of use" },
  { href: "/privacy", label: "Privacy notice" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="container-page flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-fg-muted">
          Marketplace · Real payments and meetups happen outside the app. Checkout is test mode.
        </p>
        <nav aria-label="Site information">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex min-h-11 items-center rounded-sm text-small text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
