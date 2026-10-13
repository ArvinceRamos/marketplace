import type { ReactNode } from "react";

// Building blocks for the plain-text pages (/safety, /privacy, /terms).

export function InfoSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex scroll-mt-32 flex-col gap-3 md:scroll-mt-20" id={id}>
      <h2 id={`${id}-title`} className="text-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function InfoList({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5 text-body">{children}</ul>;
}

export function InfoText({ children }: { children: ReactNode }) {
  return <p className="text-body">{children}</p>;
}

/** "Last updated" line plus a short note shown at the top of each page. */
export function InfoIntro({ updated, children }: { updated: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-fg-muted">Last updated: {updated}</p>
      <p className="text-body text-fg-muted">{children}</p>
    </div>
  );
}
