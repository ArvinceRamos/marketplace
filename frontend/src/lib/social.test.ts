import { expect, test } from "vitest";
import {
  listingNotice,
  mergeMessages,
  personName,
  previewText,
  unreadBadge,
  withCurrentOffer,
  type ConversationSummary,
  type Message,
} from "./social";

const msg = (id: number, body = `m${id}`): Message => ({
  id,
  kind: "text",
  body,
  mine: false,
  created_at: "2026-10-13T00:00:00Z",
  offer: null,
});

test("mergeMessages de-duplicates overlapping polls and sorts by id", () => {
  const merged = mergeMessages([msg(1), msg(3)], [msg(3, "updated"), msg(2)]);
  expect(merged.map((m) => [m.id, m.body])).toEqual([
    [1, "m1"],
    [2, "m2"],
    [3, "updated"],
  ]);
});

test("unread badge caps at 99+", () => {
  expect(unreadBadge(0)).toBeNull();
  expect(unreadBadge(7)).toBe("7");
  expect(unreadBadge(150)).toBe("99+");
});

test("deleted people and listings get plain labels", () => {
  expect(personName(null)).toBe("Deleted user");
  expect(personName({ username: "migs", display_name: null, avatar_url: null })).toBe("@migs");
  expect(personName({ username: "migs", display_name: "Miguel", avatar_url: null })).toBe("Miguel");
  expect(listingNotice(null)).toMatch(/no longer available/);
  const listing = { id: "x", title: "t", price_centavos: 1, cover_thumb_url: null };
  expect(listingNotice({ ...listing, status: "active" })).toBeNull();
  expect(listingNotice({ ...listing, status: "sold" })).toBe("This item is sold.");
});

test("preview marks my own last message", () => {
  const base: ConversationSummary = {
    id: "c",
    role: "buying",
    listing: null,
    other_user: null,
    last_message: null,
    unread_count: 0,
  };
  expect(previewText(base)).toBe("No messages yet");
  expect(
    previewText({ ...base, last_message: { preview: "Hi", at: "2026-10-13T00:00:00Z", mine: true } }),
  ).toBe("You: Hi");
});

test("older offer cards show the latest offer status", () => {
  const offer = {
    id: "o1",
    amount_centavos: 100,
    status: "pending" as const,
    created_at: "2026-10-13T00:00:00Z",
    expires_at: "2026-10-20T00:00:00Z",
    responded_at: null,
  };
  const card = { ...msg(5), kind: "offer" as const, offer };
  const accepted = { ...offer, status: "accepted" as const };
  expect(withCurrentOffer(card, accepted).offer?.status).toBe("accepted");
  expect(withCurrentOffer(card, { ...accepted, id: "other" }).offer?.status).toBe("pending");
  expect(withCurrentOffer(msg(6), accepted)).toEqual(msg(6));
});
