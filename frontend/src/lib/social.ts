// Shapes and helpers for favorites, chats, and offers (docs/API_SPECIFICATION.md).
import type { ListingCard } from "@/lib/catalog-types";
import { formatPrice } from "@/lib/format";

export type OfferStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "expired";
export type Role = "buying" | "selling";

export type Offer = {
  id: string;
  amount_centavos: number;
  status: OfferStatus;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
};

export type Message = {
  id: number;
  kind: "text" | "offer" | "system";
  body: string;
  mine: boolean;
  created_at: string;
  offer: Offer | null;
};

export type MessagePage = { items: Message[]; next_before: number | null };

export type Person = ListingCard["seller"];

export type ConversationSummary = {
  id: string;
  role: Role;
  listing: {
    id: string;
    title: string;
    price_centavos: number;
    status: ListingCard["status"] | "deleted";
    cover_thumb_url: string | null;
  } | null;
  other_user: Person | null;
  last_message: { preview: string; at: string; mine: boolean } | null;
  unread_count: number;
};

export type ConversationDetail = ConversationSummary & {
  latest_offer: Offer | null;
  can_message: boolean;
  can_offer: boolean;
  /** I blocked the other person. (Being blocked by them is not revealed.) */
  blocked_by_me: boolean;
};

/** Why the composer is closed, or null when messaging is open. */
export function replyBlockedReason(detail: ConversationDetail): string | null {
  if (detail.can_message) return null;
  if (!detail.other_user) return "You can't reply: the other person deleted their account.";
  if (detail.blocked_by_me) return "You blocked this user. Unblock them to send messages.";
  return "You can't message this user.";
}

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: "Waiting for reply",
  accepted: "Accepted",
  rejected: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

export function personName(person: Person | null): string {
  if (!person) return "Deleted user";
  return person.display_name || `@${person.username}`;
}

/** Banner text when the item can no longer be bought; null while it is live. */
export function listingNotice(listing: ConversationSummary["listing"]): string | null {
  if (!listing || listing.status === "deleted") return "This item is no longer available.";
  if (listing.status === "sold") return "This item is sold.";
  if (listing.status === "paused") return "The seller paused this listing.";
  return null;
}

/** Inbox preview line. Offer events read better with the amount. */
export function previewText(summary: ConversationSummary): string {
  const last = summary.last_message;
  if (!last) return "No messages yet";
  return `${last.mine ? "You: " : ""}${last.preview}`;
}

export function offerLine(offer: Offer): string {
  return `${formatPrice(offer.amount_centavos)} · ${OFFER_STATUS_LABELS[offer.status]}`;
}

/** Keep the newest copy of each message and sort by ID (polls can overlap). */
export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

/**
 * Polling only fetches new messages, so an older offer card would keep its old
 * status. Only the latest offer can still change (one pending at a time), and the
 * chat details carry its current state.
 */
export function withCurrentOffer(m: Message, latest: Offer | null): Message {
  return m.offer && latest && m.offer.id === latest.id ? { ...m, offer: latest } : m;
}
