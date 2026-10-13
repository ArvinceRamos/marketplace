import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { ListingViewerPanel } from "@/components/listing-viewer-panel";
import { Container, Stack } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/text-link";
import { getListingOr404 } from "@/lib/catalog";
import type { ListingDetail } from "@/lib/catalog-types";
import { CONDITION_HINTS, CONDITION_LABELS, formatDate, formatPrice } from "@/lib/format";

type Props = PageProps<"/listing/[id]">;

export default function ListingPage(props: Props) {
  return (
    <main className="flex-1">
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
  const deal = [listing.meetup && "Meetup", listing.delivery && "Delivery"].filter(Boolean);
  return (
    <Stack gap={6}>
      <Breadcrumbs listing={listing} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
        <Gallery listing={listing} />
        <div className="flex flex-col gap-6 lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:self-start">
          <StatusBanner status={listing.status} />
          <Stack gap={2}>
            <p className="text-heading font-semibold lg:text-display" data-numeric>
              {formatPrice(listing.price_centavos)}
            </p>
            <h1 className="text-title font-regular text-fg">{listing.title}</h1>
            <p className="text-small text-fg-muted">
              {listing.city.name}
              {listing.published_at && <> · Listed {formatDate(listing.published_at)}</>}
            </p>
          </Stack>

          <ListingViewerPanel listingId={listing.id} title={listing.title} status={listing.status} />

          <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 border-y border-border py-4 text-small">
            <dt className="text-fg-muted">Condition</dt>
            <dd>
              <span className="font-medium">{CONDITION_LABELS[listing.condition]}</span>
              <span className="block text-caption text-fg-muted">
                {CONDITION_HINTS[listing.condition]}
              </span>
            </dd>
            <dt className="text-fg-muted">Category</dt>
            <dd>
              <TextLink href={`/categories/${listing.category.slug}`}>
                {listing.category.name}
              </TextLink>
            </dd>
            <dt className="text-fg-muted">Deal</dt>
            <dd>
              {deal.join(" or ")}
              {listing.deal_note && (
                <span className="block text-caption text-fg-muted">{listing.deal_note}</span>
              )}
            </dd>
          </dl>

          <SellerCard listing={listing} />

          <p className="rounded-md bg-surface-muted p-4 text-caption text-fg-muted">
            Payments and delivery are arranged between you and the seller, outside this site. Meet
            in a public place, check the item before paying, and never send money in advance to
            someone you have not met.
          </p>
        </div>
      </div>

      <section aria-labelledby="desc-heading" className="flex max-w-3xl flex-col gap-2">
        <h2 id="desc-heading" className="text-title">
          Description
        </h2>
        <p className="text-body whitespace-pre-line text-fg">
          {listing.description || "The seller did not add a description."}
        </p>
      </section>
    </Stack>
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

/** Swipeable photo row on phones; a grid on desktop (first photo large). */
function Gallery({ listing }: { listing: ListingDetail }) {
  if (listing.images.length === 0) {
    return (
      <div className="media-frame grid place-items-center text-small text-fg-subtle">No photos</div>
    );
  }
  return (
    <ul
      aria-label={`${listing.images.length} photos`}
      className="scroll-row -mx-4 px-4 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0"
    >
      {listing.images.map((img, i) => (
        <li
          key={img.id}
          className={`${listing.images.length > 1 ? "w-[85%]" : "w-full"} lg:w-auto ${i === 0 ? "lg:col-span-2" : ""}`}
        >
          <div className="media-frame">
            <Image
              src={img.full_url}
              alt={i === 0 ? listing.title : `${listing.title}, photo ${i + 1}`}
              fill
              priority={i === 0}
              sizes="(min-width: 64rem) 50vw, 85vw"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusBanner({ status }: { status: ListingDetail["status"] }) {
  if (status === "active") return null;
  const text =
    status === "sold"
      ? "This item has been sold."
      : status === "paused"
        ? "The seller has paused this listing for now."
        : "This listing is not published.";
  return (
    <p role="status" className="rounded-sm bg-warning-soft px-3 py-2 text-small text-fg">
      {text}
    </p>
  );
}

function SellerCard({ listing }: { listing: ListingDetail }) {
  const { seller } = listing;
  const name = seller.display_name ?? seller.username;
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} url={seller.avatar_url} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-small font-medium text-fg">{name}</span>
        <span className="text-caption text-fg-muted">@{seller.username}</span>
      </div>
      <TextLink href={`/seller/${seller.username}`} className="ml-auto text-small">
        View profile
      </TextLink>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:gap-10" aria-busy="true">
      <div className="media-frame animate-pulse" />
      <div className="flex flex-col gap-3">
        <div className="h-9 w-40 animate-pulse rounded-sm bg-ink-100" />
        <div className="h-6 w-3/4 animate-pulse rounded-sm bg-ink-100" />
        <div className="h-32 w-full animate-pulse rounded-md bg-ink-100" />
      </div>
    </div>
  );
}
