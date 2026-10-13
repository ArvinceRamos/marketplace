// Reports, blocks, and account deletion (docs/API_SPECIFICATION.md "Reports and blocks").
import type { Person } from "@/lib/social";

export type ReportReason =
  | "prohibited_item"
  | "scam"
  | "counterfeit"
  | "offensive"
  | "spam"
  | "other";

export type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";

export type Report = {
  id: string;
  target_type: "listing" | "user";
  listing: { id: string; title: string } | null;
  user: Person | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  created_at: string;
};

export type BlockedUser = Person & { blocked_at: string };

/** Who or what is being reported. Users are named by username, never by an ID. */
export type ReportTarget =
  | { type: "listing"; listingId: string; label: string }
  | { type: "user"; username: string; label: string };

export const REPORT_REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "scam", label: "Scam or fraud", hint: "Asks for payment first, fake proof, phishing links" },
  { value: "prohibited_item", label: "Prohibited item", hint: "Not allowed on this site (see Safety)" },
  { value: "counterfeit", label: "Counterfeit", hint: "Fake or copied brand goods" },
  { value: "offensive", label: "Offensive content", hint: "Harassment, hate, or explicit content" },
  { value: "spam", label: "Spam or wrong category", hint: "Repeated posts, ads, misleading listing" },
  { value: "other", label: "Something else", hint: "Tell us in the details" },
];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Received",
  reviewing: "In review",
  actioned: "Action taken",
  dismissed: "Closed",
};

export const DETAILS_MAX = 1000;

/** Request body for POST /reports. Blank details are left out. */
export function reportBody(target: ReportTarget, reason: ReportReason, details: string) {
  const text = details.trim();
  return {
    target_type: target.type,
    ...(target.type === "listing" ? { listing_id: target.listingId } : { username: target.username }),
    reason,
    ...(text ? { details: text } : {}),
  };
}

export function reportTargetLabel(report: Report): string {
  if (report.target_type === "listing") return report.listing?.title ?? "Removed listing";
  return report.user ? `@${report.user.username}` : "Deleted user";
}

/** Account deletion confirm: same rule as the API (case and a leading "@" ignored). */
export function confirmsUsername(typed: string, username: string): boolean {
  return typed.trim().replace(/^@/, "").toLowerCase() === username.toLowerCase();
}

/** Tells open inbox lists to reload (a chat was hidden or shown by a block). */
export const INBOX_CHANGED = "marketplace:inbox-changed";
