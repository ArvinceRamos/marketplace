import Link from "next/link";
import type { CategoryRef } from "@/lib/catalog-types";

/** Horizontally scrolling chips on phones; wraps on larger screens. */
export function CategoryChips({
  categories,
  activeSlug,
  label = "Categories",
}: {
  categories: CategoryRef[];
  activeSlug?: string;
  label?: string;
}) {
  return (
    <nav aria-label={label}>
      <ul className="scroll-row -mx-4 px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="list">
        {categories.map((c) => {
          const active = c.slug === activeSlug;
          return (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-9 items-center rounded-full border px-4 text-small font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent-soft text-brand-800"
                    : "border-border-strong bg-surface text-fg hover:bg-ink-100"
                }`}
              >
                {c.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
