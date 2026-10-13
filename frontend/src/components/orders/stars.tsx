/** Read-only star rating, e.g. ★★★★☆ with a text label for screen readers. */
export function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-small text-fg" role="img" aria-label={`${rating} out of 5 stars`}>
      <span aria-hidden className="tracking-wide text-star">
        {"★".repeat(rating)}
        <span className="text-ink-300">{"★".repeat(5 - rating)}</span>
      </span>
    </span>
  );
}
