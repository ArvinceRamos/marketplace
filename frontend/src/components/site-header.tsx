import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { SearchBox } from "@/components/catalog/search-box";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="container-page flex h-(--header-height) items-center gap-4">
        <Link href="/" className="shrink-0 rounded-sm text-title font-semibold tracking-tight text-accent">
          Marketplace
        </Link>
        <div className="hidden flex-1 md:block md:max-w-xl">
          <SearchBox id="site-search-desktop" />
        </div>
        <div className="ml-auto">
          <AuthNav />
        </div>
      </div>
      {/* Phones: search gets its own row under the logo. */}
      <div className="container-page pb-3 md:hidden">
        <SearchBox id="site-search-mobile" />
      </div>
    </header>
  );
}
