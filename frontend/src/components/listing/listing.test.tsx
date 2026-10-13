import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ProfileStats } from "@/components/profile-stats";
import type { ListingViewer, PublicProfile } from "@/lib/catalog-types";
import { Gallery } from "./gallery";
import { ListingCta } from "./listing-cta";
import { ListingViewerProvider, NotForOwner } from "./viewer-context";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/listing/l1",
}));

const state: { session: string; viewer: ListingViewer | null } = { session: "guest", viewer: null };
vi.mock("@/components/providers", () => ({
  useSession: () => state.session,
  useFavorites: () => ({ ids: new Set<string>(), toggle: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error {},
  apiFetch: vi.fn(async () => state.viewer),
}));

afterEach(() => {
  cleanup();
  state.session = "guest";
  state.viewer = null;
});

function renderCta(status: ListingViewer["status"] = "active") {
  return render(
    <ListingViewerProvider listingId="l1" status={status}>
      <ListingCta listingId="l1" title="Phone" similarHref="/categories/mobile-phones" />
      <NotForOwner>
        <p>More from the seller</p>
      </NotForOwner>
    </ListingViewerProvider>,
  );
}

test("buy and chat show at once for guests (no empty slot while loading)", () => {
  renderCta();
  // Desktop panel and phone bar both have them.
  expect(screen.getAllByRole("link", { name: "Buy" })[0].getAttribute("href")).toBe("/checkout/l1");
  expect(screen.getAllByRole("button", { name: "Chat with seller" }).length).toBe(2);
  expect(screen.getByText("More from the seller")).toBeTruthy();
});

test("an unavailable item offers similar items instead of Buy", () => {
  renderCta("sold");
  expect(screen.queryByRole("link", { name: "Buy" })).toBeNull();
  expect(screen.getAllByRole("link", { name: "See similar items" })[0].getAttribute("href")).toBe(
    "/categories/mobile-phones",
  );
  expect(screen.getByText("Sold")).toBeTruthy();
});

test("the owner gets status tools, and recommendations are hidden", async () => {
  state.session = "user";
  state.viewer = {
    status: "active",
    is_owner: true,
    is_favorited: false,
    my_conversation_id: null,
    my_open_order_id: null,
  };
  renderCta();
  await waitFor(() => expect(screen.getByText("This is your listing.")).toBeTruthy());
  expect(screen.getAllByRole("button", { name: "Mark as sold" }).length).toBe(2);
  expect(screen.queryByRole("link", { name: "Buy" })).toBeNull();
  expect(screen.queryByText("More from the seller")).toBeNull();
});

test("a buyer with an open order is sent to it", async () => {
  state.session = "user";
  state.viewer = {
    status: "reserved",
    is_owner: false,
    is_favorited: false,
    my_conversation_id: "c1",
    my_open_order_id: "o1",
  };
  renderCta("reserved");
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: "View your order" })[0].getAttribute("href")).toBe("/orders/o1"),
  );
});

test("gallery without photos says what to do", () => {
  render(
    <ListingViewerProvider listingId="l1" status="active">
      <Gallery listingId="l1" title="Phone" images={[]} />
    </ListingViewerProvider>,
  );
  expect(screen.getByText(/Ask for some in the chat/)).toBeTruthy();
});

const profile: PublicProfile = {
  username: "migs",
  display_name: "Miguel",
  avatar_url: null,
  bio: null,
  city: null,
  joined_at: "2026-01-15T00:00:00Z",
  active_listing_count: 3,
  sold_count: 41,
  follower_count: 1,
  rating_average: 4.8,
  rating_count: 32,
  restricted: false,
};

test("profile stats: rating, items sold, followers, joined", () => {
  render(<ProfileStats profile={profile} />);
  expect(screen.getByText("4.8")).toBeTruthy();
  expect(screen.getByText("32 reviews")).toBeTruthy();
  expect(screen.getByText("41")).toBeTruthy();
  expect(screen.getByText("Follower")).toBeTruthy();
  expect(screen.getByText("Jan 2026")).toBeTruthy();
});

test("profile stats without reviews", () => {
  render(<ProfileStats profile={{ ...profile, rating_average: null, rating_count: 0 }} />);
  expect(screen.getByText("No reviews")).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy();
});
