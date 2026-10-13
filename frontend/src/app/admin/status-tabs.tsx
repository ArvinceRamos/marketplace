import Link from "next/link";

/** Filter links for a moderator queue, kept in the URL (?status=). */
export function StatusTabs({
  base,
  current,
  options,
}: {
  base: string;
  current: string;
  options: { value: string; label: string }[];
}) {
  return (
    <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Link
          key={o.value}
          href={`${base}?status=${o.value}`}
          aria-current={o.value === current ? "page" : undefined}
          className={`rounded-full border px-3 py-1.5 text-small ${
            o.value === current
              ? "border-accent bg-accent-soft font-medium text-fg"
              : "border-border text-fg-muted hover:text-fg"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
