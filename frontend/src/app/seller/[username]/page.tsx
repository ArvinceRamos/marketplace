import { Suspense } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { EmptyState } from "@/components/catalog/empty-state";
import { ListingGrid, ListingGridSkeleton } from "@/components/catalog/listing-grid";
import { Pagination } from "@/components/catalog/pagination";
import { Container, Stack } from "@/components/ui/layout";
import { getProfileOr404, getSellerListings } from "@/lib/catalog";
import { formatDate } from "@/lib/format";

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
  const [profile, listings] = await Promise.all([
    getProfileOr404(username),
    getSellerListings(username, page),
  ]);
  const name = profile.display_name ?? profile.username;
  const details = [profile.city?.name, `Joined ${formatDate(profile.joined_at)}`].filter(Boolean);

  return (
    <Stack gap={8}>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar name={name} url={profile.avatar_url} size={64} />
        <Stack gap={2}>
          <div>
            <h1 className="text-heading">{name}</h1>
            <p className="text-small text-fg-muted">@{profile.username}</p>
          </div>
          <p className="text-small text-fg-muted">{details.join(" · ")}</p>
          {profile.bio && <p className="max-w-2xl text-body">{profile.bio}</p>}
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
    </Stack>
  );
}
