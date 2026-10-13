import type { CategoryNode, Courier, PaymentMethod } from "@/lib/catalog-types";

// Plain names, so buyers know up front how a seller takes payment and ships.
// Labels only: the app never handles money or bookings.
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  gcash: "GCash",
  maya: "Maya",
  bank_transfer: "Bank transfer",
  cash: "Cash on meetup",
  cod: "Cash on delivery (COD)",
};

export const COURIER_LABELS: Record<Courier, string> = {
  jnt: "J&T Express",
  flash: "Flash Express",
  lbc: "LBC",
  lalamove: "Lalamove",
  grab: "GrabExpress",
};

/** "M" -> "Size M"; sizes that already say what they are ("EU 38", "3-4 years") stay. */
export function sizeLabel(size: string): string {
  return /^(EU |Free)|years|months/.test(size) ? size : `Size ${size}`;
}

/** Size list of a subcategory, or [] (parent categories and unknown slugs have none). */
export function sizesFor(tree: CategoryNode[], slug: string | undefined): string[] {
  if (!slug) return [];
  for (const parent of tree) {
    const child = parent.children.find((c) => c.slug === slug || String(c.id) === slug);
    if (child) return child.sizes;
  }
  return [];
}

/**
 * Keep payment methods and couriers consistent with the deal method, like the API:
 * COD and couriers need delivery; cash in hand needs a meetup.
 */
export function fitDealOptions(
  meetup: boolean,
  delivery: boolean,
  payments: PaymentMethod[],
  couriers: Courier[],
): { payments: PaymentMethod[]; couriers: Courier[] } {
  return {
    payments: payments.filter((p) => (p === "cod" ? delivery : p === "cash" ? meetup : true)),
    couriers: delivery ? couriers : [],
  };
}
