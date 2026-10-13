import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="container-page flex h-(--header-height) items-center justify-between gap-4">
        <Link
          href="/"
          className="rounded-sm text-title font-semibold tracking-tight text-accent"
        >
          Marketplace
        </Link>
        <AuthNav />
      </div>
    </header>
  );
}
