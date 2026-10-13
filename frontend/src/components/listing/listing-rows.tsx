import { ListingCard } from "@/components/catalog/listing-card";
import { TextLink } from "@/components/ui/text-link";
import { getSellerListings, searchListings } from "@/lib/catalog";
import type { ListingCard as Card, ListingDetail } from "@/lib/catalog-types";

/** One row of listings: a swipe row on phones, a 5-column grid on desktop. */
function Row({ title, href, items }: { title: string; href: string; items: Card[] }) {
  if (items.length === 0) return null;
  const id = `row-${href.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-border pt-6 lg:gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-title font-semibold">
          {title}
        </h2>
        <TextLink href={href} className="shrink-0 text-small font-medium">
          See all
        </TextLink>
      </div>
      <ul className="scroll-row -mx-4 px-4 md:-mx-5 md:px-5 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-x-4 lg:gap-y-6 lg:overflow-visible lg:px-0">
        {items.map((card) => (
          <li key={card.id} className="w-36 shrink-0 lg:w-auto">
            <ListingCard listing={card} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "More from @seller" and "More in {category}", so the page doesn't end in a dead end.
 * For a sold or reserved item, similar items come first. Best effort: if the API is
 * slow or down, the rows are simply left out.
 */
export async function ListingRows({ listing }: { listing: ListingDetail }) {
  const [fromSeller, inCategory] = await Promise.all([
    getSellerListings(listing.seller.username).catch(() => null),
    searchListings({ category: listing.category.slug }, 12).catch(() => null),
  ]);
  const others = (cards: Card[] | undefined) => (cards ?? []).filter((c) => c.id !== listing.id).slice(0, 10);
  const rows = [
    {
      title: `More from @${listing.seller.username}`,
      href: `/seller/${listing.seller.username}`,
      items: others(fromSeller?.items),
    },
    {
      title: `More in ${listing.category.name}`,
      href: `/categories/${listing.category.slug}`,
      items: others(inCategory?.items),
    },
  ];
  if (listing.status !== "active") rows.reverse();
  return (
    <div className="flex flex-col gap-6">
      {rows.map((row) => (
        <Row key={row.href} {...row} />
      ))}
    </div>
  );
}
