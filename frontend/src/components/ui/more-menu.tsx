"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";

export const moreMenuItem =
  "block w-full rounded-sm px-3 py-2.5 text-left text-small text-fg hover:bg-ink-100 disabled:opacity-50";

/**
 * A "•••" disclosure menu (<details>), like the Account menu: keyboard friendly,
 * closes on outside click, Esc, navigation, and after an item is chosen.
 */
export function MoreMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useLayoutEffect(() => {
    const details = ref.current;
    if (details) details.open = false;
    return () => {
      if (details) details.open = false;
    };
  }, [pathname]);

  useEffect(() => {
    const close = (event: Event) => {
      const details = ref.current;
      if (!details?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        details.open = false;
        details.querySelector("summary")?.focus();
        return;
      }
      // Choosing an item (a button inside the panel) closes the menu too.
      const target = event.target as Element;
      if (!details.contains(target) || target.closest("[data-menu-item]")) details.open = false;
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
        aria-label={label}
        title={label}
        className={`${buttonClasses({ variant: "ghost" })} cursor-pointer list-none px-3 [&::-webkit-details-marker]:hidden`}
      >
        <span aria-hidden className="text-title leading-none">
          •••
        </span>
      </summary>
      <div className="absolute right-0 z-30 mt-1 flex w-52 flex-col rounded-md border border-border bg-surface p-1 shadow-lg">
        {children}
      </div>
    </details>
  );
}
