import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { EmptyState } from "@/components/catalog/empty-state";
import { ListingGrid, ListingGridSkeleton } from "@/components/catalog/listing-grid";
import { Pagination } from "@/components/catalog/pagination";
import { Stars } from "@/components/orders/stars";
import { ProfileStats } from "@/components/profile-stats";
import { SelfProfileBar, SellerHeaderActions } from "@/components/seller-header-actions";
import { Container, Stack } from "@/components/ui/layout";
import { getProfileOr404, getSellerListings, getSellerReviews } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import type { ReviewList } from "@/lib/orders";
import { personName } from "@/lib/social";

type Props = PageProps<"/seller/[username]">;

export default function SellerPage(props: Props) {
  return (
    <main className="flex-1">
      <Container className="section-y">
        <Suspense fallback={<ListingGridSkeleton />}>
          <SellerContent params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </Container>
    </main>
  );
}

async function SellerContent({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ username }, raw] = await Promise.all([params, searchParams]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tab = one(raw.tab) === "reviews" ? "reviews" : "listings";
  const page = Math.min(50, Math.max(1, Number(one(raw.page)) || 1));
  const [profile, listings, reviews] = await Promise.all([
    getProfileOr404(username),
    getSellerListings(username, page),
    getSellerReviews(username),
  ]);
  const name = profile.display_name ?? profile.username;
  const base = `/seller/${profile.username}`;

  return (
    <Stack gap={6}>
      <SelfProfileBar username={profile.username} />

      <section className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar name={name} url={profile.avatar_url} size={64} />
          <div className="min-w-0">
            <h1 className="truncate text-heading font-semibold">{name}</h1>
            <p className="text-small text-fg-muted">
              {[`@${profile.username}`, profile.city?.name].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <SellerHeaderActions username={profile.username} name={name} followers={profile.follower_count} />
      </section>

      {profile.restricted && (
        <p role="status" className="max-w-2xl rounded-sm bg-warning-soft px-3 py-2 text-small">
          A moderator restricted this account. Be careful dealing with it.
        </p>
      )}
      {profile.bio && <p className="max-w-prose text-body text-pretty">{profile.bio}</p>}

      <ProfileStats profile={profile} />

      <nav aria-label="Profile sections" className="flex border-b border-border sm:gap-8">
        <Tab href={base} current={tab === "listings"} label="Listings" count={profile.active_listing_count} />
        <Tab href={`${base}?tab=reviews`} current={tab === "reviews"} label="Reviews" count={reviews.count} />
      </nav>

      {tab === "listings" ? (
        <section aria-label="Listings" className="flex flex-col gap-6">
          <ListingGrid
            listings={listings.items}
            empty={<EmptyState title="No active listings" body="Check back later." />}
          />
          <Pagination
            page={listings.page}
            hasNext={listings.has_next}
            total={listings.total}
            pageSize={listings.page_size}
            hrefFor={(p) => `${base}${p > 1 ? `?page=${p}` : ""}`}
          />
        </section>
      ) : (
        <Reviews reviews={reviews} />
      )}
    </Stack>
  );
}

function Tab({ href, current, label, count }: { href: string; current: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      scroll={false}
      className={`-mb-px flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-1 text-small font-medium sm:flex-none ${
        current ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
      }`}
    >
      {label}
      <span className="font-regular text-fg-muted" data-numeric>
        {count}
      </span>
    </Link>
  );
}

function Reviews({ reviews }: { reviews: ReviewList }) {
  if (reviews.items.length === 0 || reviews.average === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border-strong px-6 py-12 text-center">
        <h2 className="text-title font-semibold">No reviews yet</h2>
        <p className="max-w-md text-small text-fg-muted">Reviews come only from completed orders.</p>
      </div>
    );
  }
  return (
    <section aria-label="Reviews" className="grid items-start gap-2 lg:grid-cols-[17.5rem_minmax(0,40rem)] lg:gap-10">
      <div className="flex items-center gap-4 rounded-md bg-surface-muted p-4">
        <span className="text-display font-semibold" data-numeric>
          {reviews.average.toFixed(1)}
        </span>
        <span className="flex flex-col">
          <Stars rating={Math.round(reviews.average)} />
          <span className="text-caption text-fg-muted">
            {reviews.count} review{reviews.count === 1 ? "" : "s"}, all from completed orders
          </span>
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {reviews.items.map((r) => (
          <li key={`${r.created_at}-${r.reviewer?.username ?? "deleted"}`} className="flex flex-col gap-1 py-4 first:pt-0 lg:first:pt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stars rating={r.rating} />
              <span className="text-caption text-fg-muted">
                {personName(r.reviewer)} · {r.reviewer_role === "buyer" ? "bought" : "sold"} {r.title} ·{" "}
                {formatDate(r.created_at)}
              </span>
            </div>
            {r.comment && <p className="text-small">{r.comment}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
