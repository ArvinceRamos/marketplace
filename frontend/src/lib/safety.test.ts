import { expect, test } from "vitest";
import { confirmsUsername, reportBody, reportTargetLabel, type Report } from "@/lib/safety";
import { replyBlockedReason, type ConversationDetail } from "@/lib/social";

test("report body names a listing by ID and a user by username, never an owner ID", () => {
  expect(reportBody({ type: "listing", listingId: "L1", label: "Phone" }, "scam", "  ")).toEqual({
    target_type: "listing",
    listing_id: "L1",
    reason: "scam",
  });
  expect(reportBody({ type: "user", username: "migs", label: "Miguel" }, "other", " rude ")).toEqual({
    target_type: "user",
    username: "migs",
    reason: "other",
    details: "rude",
  });
});

test("delete confirmation ignores case, spaces, and a leading @", () => {
  expect(confirmsUsername(" @Juan.Dela_Cruz ", "juan.dela_cruz")).toBe(true);
  expect(confirmsUsername("juan", "juan.dela_cruz")).toBe(false);
  expect(confirmsUsername("", "juan")).toBe(false);
});

test("report labels survive deleted targets", () => {
  const base = { id: "r", reason: "scam", details: null, status: "open", created_at: "" } as const;
  const gone: Report = { ...base, target_type: "listing", listing: null, user: null };
  expect(reportTargetLabel(gone)).toBe("Removed listing");
  expect(reportTargetLabel({ ...gone, target_type: "user" })).toBe("Deleted user");
  expect(
    reportTargetLabel({
      ...gone,
      target_type: "user",
      user: { username: "migs", display_name: null, avatar_url: null },
    }),
  ).toBe("@migs");
});

test("composer explains why it is closed, without revealing who blocked whom", () => {
  const detail = {
    other_user: { username: "migs", display_name: null, avatar_url: null },
    can_message: false,
    blocked_by_me: false,
  } as ConversationDetail;
  expect(replyBlockedReason({ ...detail, can_message: true })).toBeNull();
  expect(replyBlockedReason({ ...detail, other_user: null })).toMatch(/deleted their account/);
  expect(replyBlockedReason({ ...detail, blocked_by_me: true })).toMatch(/You blocked/);
  expect(replyBlockedReason(detail)).toBe("You can't message this user.");
});
