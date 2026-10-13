import { Suspense } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { EmptyState } from "@/components/catalog/empty-state";
import { ListingGrid, ListingGridSkeleton } from "@/components/catalog/listing-grid";
import { FollowButton } from "@/components/follow-button";
import { Stars } from "@/components/orders/stars";
import { UserSafetyMenu } from "@/components/safety/user-safety-menu";
import { Pagination } from "@/components/catalog/pagination";
import { Container, Stack } from "@/components/ui/layout";
import { getProfileOr404, getSellerListings, getSellerReviews } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { ratingLine } from "@/lib/orders";
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
  const pageParam = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const page = Math.min(50, Math.max(1, Number(pageParam) || 1));
  const [profile, listings, reviews] = await Promise.all([
    getProfileOr404(username),
    getSellerListings(username, page),
    getSellerReviews(username),
  ]);
  const name = profile.display_name ?? profile.username;
  const details = [profile.city?.name, `Joined ${formatDate(profile.joined_at)}`].filter(Boolean);

  return (
    <Stack gap={8}>
      <section className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="absolute top-0 right-0">
          <UserSafetyMenu username={profile.username} name={name} />
        </div>
        <Avatar name={name} url={profile.avatar_url} size={64} />
        <Stack gap={2}>
          <div className="pr-14">
            <h1 className="text-heading">{name}</h1>
            <p className="text-small text-fg-muted">@{profile.username}</p>
          </div>
          <p className="text-small text-fg-muted">{details.join(" · ")}</p>
          {profile.restricted && (
            <p role="status" className="rounded-sm bg-warning-soft px-3 py-2 text-small">
              A moderator restricted this account. Be careful dealing with it.
            </p>
          )}
          <p className="text-small font-medium">
            <a href="#seller-reviews" className="hover:underline">
              {ratingLine(profile.rating_average, profile.rating_count)}
            </a>
          </p>
          {profile.bio && <p className="max-w-2xl text-body">{profile.bio}</p>}
          <FollowButton username={profile.username} followers={profile.follower_count} />
        </Stack>
      </section>
      <section aria-labelledby="seller-listings" className="flex flex-col gap-4">
        <h2 id="seller-listings" className="text-title">
          Listings{" "}
          <span className="font-regular text-fg-muted" data-numeric>
            ({profile.active_listing_count})
          </span>
        </h2>
        <ListingGrid
          listings={listings.items}
          empty={<EmptyState title="No active listings" body="Check back later." />}
        />
        <Pagination
          page={listings.page}
          hasNext={listings.has_next}
          total={listings.total}
          pageSize={listings.page_size}
          hrefFor={(p) => `/seller/${profile.username}${p > 1 ? `?page=${p}` : ""}`}
        />
      </section>
      <section aria-labelledby="seller-reviews" className="flex flex-col gap-4">
        <h2 id="seller-reviews" className="text-title">
          Reviews{" "}
          <span className="font-regular text-fg-muted" data-numeric>
            ({reviews.count})
          </span>
        </h2>
        {reviews.items.length === 0 ? (
          <p className="text-small text-fg-muted">
            No reviews yet. Reviews come only from completed orders.
          </p>
        ) : (
          <ul className="flex max-w-2xl flex-col divide-y divide-border">
            {reviews.items.map((r, i) => (
              <li key={i} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars rating={r.rating} />
                  <span className="text-caption text-fg-muted">
                    {personName(r.reviewer)} · {r.reviewer_role === "buyer" ? "bought" : "sold"}{" "}
                    {r.title} · {formatDate(r.created_at)}
                  </span>
                </div>
                {r.comment && <p className="text-small">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Stack>
  );
}
