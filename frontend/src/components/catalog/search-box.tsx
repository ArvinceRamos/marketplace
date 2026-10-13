/**
 * Plain GET form to /search: works without JavaScript, and the query lands in
 * the URL so results can be shared and bookmarked.
 */
export function SearchBox({ defaultValue = "", id = "site-search" }: { defaultValue?: string; id?: string }) {
  return (
    <form action="/search" role="search" className="relative w-full">
      <label htmlFor={id} className="sr-only">
        Search listings
      </label>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 fill-none stroke-fg-subtle stroke-2"
      >
        <circle cx="9" cy="9" r="6" />
        <path d="m14 14 4 4" strokeLinecap="round" />
      </svg>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search for items"
        maxLength={100}
        autoComplete="off"
        enterKeyHint="search"
        className="min-h-10 w-full rounded-sm border border-transparent bg-ink-100 pr-3 pl-10 text-body text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:bg-surface focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-accent"
      />
    </form>
  );
}
