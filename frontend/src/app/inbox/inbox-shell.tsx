"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { InboxList } from "./inbox-list";

/** Desktop: list and chat side by side. Phones: the list, or one chat full width. */
export function InboxShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/inbox/") ? pathname.split("/")[2] : null;
  return (
    <main className="flex-1">
      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-6 py-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:py-8">
        <section
          aria-labelledby="inbox-heading"
          className={`${activeId ? "max-lg:hidden" : ""} flex flex-col gap-3 lg:sticky lg:top-[calc(var(--header-height)+2rem)] lg:max-h-[calc(100dvh-var(--header-height)-4rem)] lg:self-start lg:overflow-y-auto`}
        >
          <h1 id="inbox-heading" className="text-heading">
            Inbox
          </h1>
          <InboxList activeId={activeId} />
        </section>
        <div className={activeId ? "" : "max-lg:hidden"}>{children}</div>
      </div>
    </main>
  );
}
