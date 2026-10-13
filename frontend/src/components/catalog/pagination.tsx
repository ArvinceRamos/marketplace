import { ButtonLink } from "@/components/ui/button";

/** Previous / next links that keep the current filters. */
export function Pagination({
  page,
  hasNext,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  hasNext: boolean;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.min(50, Math.ceil(total / pageSize)));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t border-border pt-6">
      {page > 1 ? (
        <ButtonLink href={hrefFor(page - 1)} variant="secondary" rel="prev">
          Previous
        </ButtonLink>
      ) : (
        <span />
      )}
      <p className="text-small text-fg-muted" data-numeric>
        Page {page} of {pages}
      </p>
      {hasNext && page < 50 ? (
        <ButtonLink href={hrefFor(page + 1)} variant="secondary" rel="next">
          Next
        </ButtonLink>
      ) : (
        <span />
      )}
    </nav>
  );
}
