import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { Gallery } from "@/components/listing/gallery";
import { ListingCta, ReportListingLink } from "@/components/listing/listing-cta";
import { ListingRows } from "@/components/listing/listing-rows";
import { ListingViewerProvider, NotForOwner } from "@/components/listing/viewer-context";
import { formatMonth } from "@/components/profile-stats";
import { ShareButton } from "@/components/share-button";
import { Container, Stack } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/text-link";
import { getListingOr404, getProfile } from "@/lib/catalog";
import type { ListingDetail } from "@/lib/catalog-types";
import { COURIER_LABELS, PAYMENT_LABELS } from "@/lib/deal-options";
import { CONDITION_HINTS, CONDITION_LABELS, formatDate, formatPrice } from "@/lib/format";

type Props = PageProps<"/listing/[id]">;

export default function ListingPage(props: Props) {
  return (
    // Bottom padding on phones keeps content clear of the fixed action bar.
    <main className="flex-1 pb-24 lg:pb-0">
      <Container className="section-y">
        <Suspense fallback={<DetailSkeleton />}>
          <ListingContent params={props.params} />
        </Suspense>
      </Container>
    </main>
  );
}

async function ListingContent({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const listing = await getListingOr404(id);
  const similarHref = `/categories/${listing.category.slug}`;
  return (
    <ListingViewerProvider listingId={listing.id} status={listing.status}>
      <Stack gap={6}>
        <Breadcrumbs listing={listing} />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
          <div className="flex flex-col gap-8">
            <Gallery listingId={listing.id} title={listing.title} images={listing.images} />
            {/* Desktop: description and details sit under the photos. */}
            <div className="hidden flex-col gap-8 lg:flex">
              <Description listing={listing} />
              <Details listing={listing} />
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:self-start">
            <StatusBanner status={listing.status} />
            <div className="flex items-start gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1 lg:gap-2">
                <p className="text-heading font-semibold lg:text-display" data-numeric>
                  {formatPrice(listing.price_centavos)}
                </p>
                <h1 className="text-title font-regular text-fg">{listing.title}</h1>
                <p className="text-small text-fg-muted">
                  {[CONDITION_LABELS[listing.condition], listing.city.name].join(" · ")}
                  {listing.published_at && <> · Listed {formatDate(listing.published_at)}</>}
                </p>
              </div>
              <span className="hidden lg:inline-flex">
                <ShareButton path={`/listing/${listing.id}`} title={listing.title} />
              </span>
            </div>

            <ListingCta listingId={listing.id} title={listing.title} similarHref={similarHref} />

            {/* Phones: description right under the title, then the details. */}
            <div className="flex flex-col gap-6 lg:hidden">
              <Description listing={listing} />
              <Details listing={listing} />
            </div>

            <Suspense fallback={<SellerCard listing={listing} />}>
              <SellerCardWithRating listing={listing} />
            </Suspense>

            <div className="flex items-start justify-between gap-4">
              <p className="text-caption text-fg-muted">
                Test-mode checkout. Meet in public and check the item before paying.{" "}
                <TextLink href="/safety" className="font-medium">
                  Safety tips
                </TextLink>
              </p>
              <ReportListingLink listingId={listing.id} title={listing.title} />
            </div>
          </div>
        </div>

        <NotForOwner>
          <Suspense fallback={null}>
            <ListingRows listing={listing} />
          </Suspense>
        </NotForOwner>
      </Stack>
    </ListingViewerProvider>
  );
}

function Breadcrumbs({ listing }: { listing: ListingDetail }) {
  const crumbs = [listing.parent_category, listing.category].filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-caption text-fg-muted">
        <li>
          <Link href="/" className="hover:text-fg hover:underline">
            Home
          </Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.slug} className="flex items-center gap-1">
            <span aria-hidden>/</span>
            <Link href={`/categories/${c.slug}`} className="hover:text-fg hover:underline">
              {c.name}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Description({ listing }: { listing: ListingDetail }) {
  return (
    <section className="flex max-w-prose flex-col gap-2">
      <h2 className="text-title font-semibold">Description</h2>
      <p className="text-body whitespace-pre-line text-pretty text-fg">
        {listing.description || "The seller did not add a description."}
      </p>
    </section>
  );
}

function Details({ listing }: { listing: ListingDetail }) {
  const deal = [listing.meetup && "Meetup", listing.delivery && "Delivery"].filter(Boolean);
  return (
    <section className="flex max-w-prose flex-col gap-2">
      <h2 className="text-title font-semibold max-lg:sr-only">Details</h2>
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-y border-border py-4 text-small lg:grid-cols-[7rem_minmax(0,1fr)] lg:border-b-0">
        <dt className="text-fg-muted">Condition</dt>
        <dd>
          <span className="font-medium">{CONDITION_LABELS[listing.condition]}</span>
          <span className="block text-caption text-fg-muted">{CONDITION_HINTS[listing.condition]}</span>
        </dd>
        {listing.size && (
          <>
            <dt className="text-fg-muted">Size</dt>
            <dd className="font-medium">{listing.size}</dd>
          </>
        )}
        <dt className="text-fg-muted">Category</dt>
        <dd>
          <TextLink href={`/categories/${listing.category.slug}`} className="font-medium">
            {listing.category.name}
          </TextLink>
        </dd>
        <dt className="text-fg-muted">Deal</dt>
        <dd>
          {deal.join(" or ")}
          {listing.deal_note && <span className="block text-caption text-fg-muted">{listing.deal_note}</span>}
        </dd>
        {listing.payment_methods.length > 0 && (
          <>
            <dt className="text-fg-muted">Payment</dt>
            <dd>{listing.payment_methods.map((m) => PAYMENT_LABELS[m]).join(", ")}</dd>
          </>
        )}
        {listing.couriers.length > 0 && (
          <>
            <dt className="text-fg-muted">Ships via</dt>
            <dd>{listing.couriers.map((c) => COURIER_LABELS[c]).join(", ")}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function StatusBanner({ status }: { status: ListingDetail["status"] }) {
  if (status === "active") return null;
  const text =
    status === "sold"
      ? "This item has been sold."
      : status === "reserved"
        ? "This item is reserved for a buyer's order."
        : status === "paused"
          ? "The seller has paused this listing for now."
          : "This listing is not published.";
  return (
    <p role="status" className="rounded-sm bg-warning-soft px-3 py-2 text-small text-fg">
      {text}
    </p>
  );
}

/** The seller card, plus their rating once the profile has loaded. */
async function SellerCardWithRating({ listing }: { listing: ListingDetail }) {
  const profile = await getProfile(listing.seller.username);
  return (
    <SellerCard
      listing={listing}
      rating={profile ? { average: profile.rating_average, count: profile.rating_count } : undefined}
      city={profile?.city?.name}
      joined={profile?.joined_at}
    />
  );
}

function SellerCard({
  listing,
  rating,
  city,
  joined,
}: {
  listing: ListingDetail;
  rating?: { average: number | null; count: number };
  city?: string;
  joined?: string;
}) {
  const { seller } = listing;
  const name = seller.display_name ?? seller.username;
  const meta = [`@${seller.username}`, city, joined && `Joined ${formatMonth(joined)}`].filter(Boolean);
  return (
    <Link
      href={`/seller/${seller.username}`}
      className="group flex min-h-11 items-center gap-3 rounded-md border border-border p-3 hover:bg-surface-muted lg:p-4"
    >
      <Avatar name={name} url={seller.avatar_url} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-small font-medium text-fg">{name}</span>
        {rating && (
          <span className="text-caption text-fg-muted">
            {rating.count > 0 && rating.average !== null ? (
              <>
                <span aria-hidden className="text-star">
                  ★
                </span>{" "}
                {rating.average.toFixed(1)} · {rating.count} review{rating.count === 1 ? "" : "s"}
              </>
            ) : (
              "No reviews yet"
            )}
          </span>
        )}
        <span className="truncate text-caption text-fg-muted">{meta.join(" · ")}</span>
      </span>
      <span className="hidden text-small font-medium text-accent underline underline-offset-2 lg:inline">
        View profile
      </span>
      <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0 text-fg-subtle lg:hidden" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}


function DetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:gap-10" aria-busy="true" aria-label="Loading listing">
      <div className="media-frame -mx-4 animate-pulse rounded-none md:-mx-5 lg:mx-0 lg:rounded-sm" />
      <div className="flex flex-col gap-3">
        <div className="h-9 w-40 animate-pulse rounded-sm bg-ink-100" />
        <div className="h-6 w-3/4 animate-pulse rounded-sm bg-ink-100" />
        <div className="h-4 w-1/2 animate-pulse rounded-sm bg-ink-50" />
        <div className="h-24 w-full animate-pulse rounded-md bg-ink-50" />
      </div>
    </div>
  );
}
