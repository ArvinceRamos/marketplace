// Orders, simulated payments, and the wallet (docs/TRANSACTIONS_DESIGN.md).
// TEST MODE: no real money moves. The API computes every amount.
import type { Courier } from "@/lib/catalog-types";
import type { Person } from "@/lib/social";

export type Fulfilment = "meetup" | "delivery";
export type OrderPayment = "online" | "cash" | "cod";
export type OrderStatus =
  | "pending_payment"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed"
  | "refunded";
export type OrderRole = "buying" | "selling";

export type CheckoutOptions = {
  listing_id: string;
  title: string;
  cover_thumb_url: string | null;
  seller: Person;
  offer_id: string | null;
  item_price_centavos: number;
  payment_methods: Partial<Record<Fulfilment, OrderPayment[]>>;
  couriers: { code: Courier; fee_centavos: number }[];
};

export type Quote = {
  item_price_centavos: number;
  shipping_fee_centavos: number;
  buyer_fee_centavos: number;
  total_centavos: number;
};

export type OrderTerms = {
  listing_id: string;
  offer_id?: string;
  fulfilment: Fulfilment;
  payment_method: OrderPayment;
  courier?: Courier;
};

export type OrderSummary = {
  id: string;
  role: OrderRole;
  status: OrderStatus;
  title: string;
  cover_thumb_url: string | null;
  listing_id: string | null;
  other_user: Person | null;
  fulfilment: Fulfilment;
  payment_method: OrderPayment;
  total_centavos: number;
  created_at: string;
  updated_at: string;
};

export type OrderPage = { items: OrderSummary[]; page: number; page_size: number; has_next: boolean };

export type OrderDetail = OrderSummary & {
  courier: Courier | null;
  item_price_centavos: number;
  shipping_fee_centavos: number;
  buyer_fee_centavos: number;
  offer_id: string | null;
  cancel_reason: string | null;
  payment_status: "pending" | "succeeded" | "failed" | "refunded" | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  payment_due_at: string | null;
  ship_by: string | null;
  meet_by: string | null;
  confirm_by: string | null;
  handover_code: string | null;
  shipment: Shipment | null;
  my_review: OrderReview | null;
  /** Hidden until both sides reviewed or 14 days passed (double-blind). */
  their_review: OrderReview | null;
  review_until: string | null;
  dispute: Dispute | null;
  actions: string[];
};

export type DisputeReason =
  | "not_received"
  | "not_as_described"
  | "incomplete"
  | "taken_without_code"; // the seller's report on a paid meetup

export type Dispute = {
  id: string;
  reason: DisputeReason;
  details: string | null;
  status: "open" | "escalated" | "resolved";
  opened_by: "buyer" | "seller";
  respond_by: string | null;
  /** Escalated: refunded to the buyer if no moderator decides by then. */
  decide_by: string | null;
  seller_note: string | null;
  admin_note: string | null;
  outcome: "refunded" | "released" | "withdrawn" | null;
  created_at: string;
  resolved_at: string | null;
};

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  not_received: "I didn't receive it",
  not_as_described: "It's not as described",
  incomplete: "Parts or items are missing",
  taken_without_code: "The buyer left with the item without giving the code",
};

/** One line for the dispute's state, from the viewer's side. */
export function disputeLine(dispute: Dispute, role: OrderRole): string {
  if (dispute.status === "resolved") {
    if (dispute.outcome === "refunded") return "Resolved: the buyer was refunded in full.";
    if (dispute.outcome === "withdrawn")
      return dispute.opened_by === "seller"
        ? "Resolved: the buyer confirmed they have the item, and the money went to the seller."
        : "Resolved: the buyer withdrew the report.";
    return "Resolved: the money was released to the seller.";
  }
  if (dispute.status === "escalated") {
    if (dispute.opened_by === "seller" && role === "buying")
      return "The seller says you left with the item without giving the code. A moderator will decide. If you have the item, confirm it to pay the seller.";
    return "A moderator is reviewing this. Their decision is final.";
  }
  return role === "selling"
    ? "Refund the buyer, or contest it so a moderator decides. If you don't answer in time, a moderator decides."
    : "Waiting for the seller to answer. You can ask a moderator now, or withdraw if it's solved.";
}

export type ShipmentStatus =
  | "label_created"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered";

export type Shipment = {
  courier: Courier;
  tracking_number: string;
  status: ShipmentStatus;
  events: { status: ShipmentStatus; created_at: string }[];
};

export type OrderReview = { rating: number; comment: string | null; created_at: string };

export type PublicReview = OrderReview & {
  reviewer: Person | null;
  reviewer_role: "buyer" | "seller";
  title: string;
};

export type ReviewList = { average: number | null; count: number; items: PublicReview[] };

export const SHIPMENT_STEPS: { status: ShipmentStatus; label: string }[] = [
  { status: "label_created", label: "Label created" },
  { status: "picked_up", label: "Picked up by courier" },
  { status: "in_transit", label: "In transit" },
  { status: "out_for_delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
];

/** "4.5 ★ (12 reviews)" or "No reviews yet". */
export function ratingLine(average: number | null, count: number): string {
  if (!count || average === null) return "No reviews yet";
  return `${average.toFixed(1)} ★ (${count} review${count === 1 ? "" : "s"})`;
}

export type MockPaySession = {
  ref: string;
  order_id: string;
  title: string;
  amount_centavos: number;
  status: "pending" | "succeeded" | "failed" | "refunded";
};

export type WalletEntry = {
  id: number;
  order_id: string | null;
  kind: "sale" | "withdrawal" | "payment" | "refund";
  amount_centavos: number;
  memo: string;
  created_at: string;
};

export type Wallet = {
  available_centavos: number;
  pending_centavos: number;
  entries: WalletEntry[];
  has_more: boolean;
};

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

/** Exact money for orders and the wallet: 105150 -> "₱1,051.50"; 0 -> "₱0.00". */
export function formatMoney(centavos: number): string {
  return peso.format(centavos / 100);
}

/** Signed wallet amount: "+₱500.00" / "−₱500.00". */
export function formatSigned(centavos: number): string {
  return `${centavos < 0 ? "−" : "+"}${formatMoney(Math.abs(centavos))}`;
}

export const FULFILMENT_LABELS: Record<Fulfilment, string> = {
  meetup: "Meetup",
  delivery: "Delivery",
};

export const ORDER_PAYMENT_LABELS: Record<OrderPayment, string> = {
  online: "Protected payment (MockPay)",
  cash: "Cash at the meetup",
  cod: "Cash on delivery (COD)",
};

export const ORDER_PAYMENT_HINTS: Record<OrderPayment, string> = {
  online: "Held until you confirm you got the item. Test mode — no real money.",
  cash: "Pay the seller in person. The app only records the deal; no buyer protection.",
  cod: "Pay the courier when the parcel arrives. No buyer protection.",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Waiting for payment",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Problem reported",
  refunded: "Refunded",
};

export const CANCEL_REASON_LABELS: Record<string, string> = {
  buyer: "Cancelled by the buyer.",
  seller: "Cancelled by the seller.",
  payment_expired: "Not paid within 30 minutes.",
  not_shipped: "The seller didn't ship within 5 days.",
  not_met: "The meetup didn't happen within 7 days.",
};

/** One line telling the viewer what happens next. */
export function nextStep(order: OrderDetail): string {
  const buyer = order.role === "buying";
  const meetup = order.fulfilment === "meetup";
  switch (order.status) {
    case "pending_payment":
      return buyer
        ? "Pay within 30 minutes to keep this item."
        : "Waiting for the buyer to pay. The item is reserved meanwhile.";
    case "confirmed":
      if (meetup) {
        return buyer
          ? "Meet the seller. Check the item, then give them your handover code."
          : "Meet the buyer. Ask for their handover code after they've checked the item.";
      }
      return buyer ? "Waiting for the seller to ship." : "Ship the item within 5 days.";
    case "shipped":
      if (order.payment_method === "cod")
        return buyer
          ? "Your parcel is on its way. Pay the courier when it arrives."
          : "On its way. The courier pays you when the buyer pays on delivery.";
      return buyer
        ? "Your parcel is on its way. Tap “Everything is OK” once you have it."
        : "The parcel is on its way.";
    case "delivered":
      return buyer
        ? "Check the item. Confirm it's OK, or report a problem within 2 days."
        : "Delivered. Money is released when the buyer confirms, or after 2 days.";
    case "completed":
      return order.actions.includes("review") ? "Done. You can leave a review." : "Done.";
    case "cancelled":
      return CANCEL_REASON_LABELS[order.cancel_reason ?? ""] ?? "This order was cancelled.";
    case "disputed":
      return "A problem was reported. See below.";
    case "refunded":
      return "The buyer was refunded in full.";
  }
}

/** The deadline that matters now, with a label; null when nothing is due. */
export function currentDeadline(order: OrderDetail): { label: string; at: string } | null {
  if (order.status === "pending_payment" && order.payment_due_at)
    return { label: "Pay by", at: order.payment_due_at };
  if (order.status === "confirmed" && order.ship_by) return { label: "Ship by", at: order.ship_by };
  if (order.status === "confirmed" && order.meet_by) return { label: "Meet by", at: order.meet_by };
  if (order.status === "delivered" && order.confirm_by)
    return { label: "Auto-completes", at: order.confirm_by };
  if (order.status === "disputed" && order.dispute?.status === "open" && order.dispute.respond_by)
    return { label: "Seller answers by", at: order.dispute.respond_by };
  if (order.status === "disputed" && order.dispute?.status === "escalated" && order.dispute.decide_by)
    return { label: "Buyer refunded unless a moderator decides by", at: order.dispute.decide_by };
  return null;
}

/** Default choices for the checkout form: the first allowed deal method, online payment. */
export function defaultTerms(options: CheckoutOptions): Omit<OrderTerms, "listing_id"> {
  const fulfilment = (["meetup", "delivery"] as const).find((f) => options.payment_methods[f]);
  const chosen = fulfilment ?? "meetup";
  return {
    fulfilment: chosen,
    payment_method: "online",
    courier: chosen === "delivery" ? options.couriers[0]?.code : undefined,
  };
}

export const WALLET_KIND_LABELS: Record<WalletEntry["kind"], string> = {
  sale: "Sale",
  withdrawal: "Withdrawal",
  payment: "Payment",
  refund: "Refund",
};

/** Whole pesos typed by the user -> centavos, or null if not a valid amount. */
export function pesosToCentavos(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number.parseFloat(trimmed) * 100);
}
