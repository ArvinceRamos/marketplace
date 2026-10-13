import Image from "next/image";
import Link from "next/link";
import type { ListingCard as Card } from "@/lib/catalog-types";
import { CONDITION_LABELS, formatPrice } from "@/lib/format";

const STATUS_BADGE: Partial<Record<Card["status"], string>> = {
  sold: "Sold",
  paused: "Paused",
};

/** Borderless product card: photo first, then price, title, and quiet details. */
export function ListingCard({ listing, priority = false }: { listing: Card; priority?: boolean }) {
  const badge = STATUS_BADGE[listing.status];
  return (
    <article className="group relative flex flex-col gap-2">
      <div className="media-frame">
        {listing.cover_thumb_url ? (
          <Image
            src={listing.cover_thumb_url}
            alt=""
            fill
            sizes="(min-width: 80rem) 20vw, (min-width: 64rem) 25vw, (min-width: 40rem) 33vw, 50vw"
            priority={priority}
            className="transition-transform duration-300 ease-standard group-hover:scale-[1.02]"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-caption text-fg-subtle">
            No photo
          </span>
        )}
        {badge && (
          <span className="absolute top-2 left-2 rounded-full bg-ink-950/80 px-2 py-0.5 text-caption font-medium text-white">
            {badge}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <p className="text-body font-semibold text-fg" data-numeric>
          {formatPrice(listing.price_centavos)}
        </p>
        <h3 className="line-clamp-2 text-small font-regular text-fg">
          {/* The whole card is clickable through this link's stretched area. */}
          <Link
            href={`/listing/${listing.id}`}
            className="after:absolute after:inset-0 after:rounded-sm focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
          >
            {listing.title}
          </Link>
        </h3>
        <p className="text-caption text-fg-muted">
          {CONDITION_LABELS[listing.condition]} · {listing.city.name}
        </p>
      </div>
    </article>
  );
}
