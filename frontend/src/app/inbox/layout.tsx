import type { Metadata } from "next";
import { Suspense } from "react";
import { InboxShell } from "./inbox-shell";

export const metadata: Metadata = { title: "Inbox · Marketplace", robots: { index: false } };

// The shell reads the URL (which chat is open), so it renders at request time
// inside Suspense; the static fallback is prerendered.
export default function InboxLayout({ children }: LayoutProps<"/inbox">) {
  return (
    <Suspense
      fallback={
        <main className="container-page flex-1 py-8">
          <p aria-busy="true">Loading inbox…</p>
        </main>
      }
    >
      <InboxShell>{children}</InboxShell>
    </Suspense>
  );
}
