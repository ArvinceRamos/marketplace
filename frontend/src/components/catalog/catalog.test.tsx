import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
// The heart needs a signed-in session; it is tested on its own.
vi.mock("@/components/favorite-button", () => ({ FavoriteButton: () => null }));

import type { ListingCard as Card } from "@/lib/catalog-types";
import { ListingCard } from "./listing-card";
import { Pagination } from "./pagination";

afterEach(cleanup);

const listing: Card = {
  id: "4dd3aa0a-f454-4007-af2b-89896268c7d9",
  title: "iPhone 13 128GB",
  price_centavos: 2350000,
  condition: "lightly_used",
  status: "sold",
  city: { id: 5, slug: "makati", name: "Makati" },
  cover_thumb_url: "http://127.0.0.1:54421/storage/v1/object/public/listing-images/a/b-thumb.webp",
  seller: { username: "migs", display_name: "Miguel", avatar_url: null },
  published_at: "2026-10-10T00:00:00Z",
};

test("card shows price, title link, details, and sold badge", () => {
  render(<ListingCard listing={listing} />);
  expect(screen.getByText("₱23,500")).toBeDefined();
  const link = screen.getByRole("link", { name: "iPhone 13 128GB" });
  expect(link.getAttribute("href")).toBe(`/listing/${listing.id}`);
  expect(screen.getByText("Lightly used · Makati")).toBeDefined();
  expect(screen.getByText("Sold")).toBeDefined();
});

test("card without a photo shows a placeholder", () => {
  render(<ListingCard listing={{ ...listing, cover_thumb_url: null, status: "active" }} />);
  expect(screen.getByText("No photo")).toBeDefined();
  expect(screen.queryByText("Sold")).toBeNull();
});

test("pagination links keep filters and hide at the ends", () => {
  const href = (p: number) => `/search?q=bag&page=${p}`;
  render(<Pagination page={1} hasNext total={50} pageSize={24} hrefFor={href} />);
  expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
  expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/search?q=bag&page=2");
  expect(screen.getByText("Page 1 of 3")).toBeDefined();
});

test("pagination is hidden for a single page", () => {
  const { container } = render(
    <Pagination page={1} hasNext={false} total={5} pageSize={24} hrefFor={() => "/"} />,
  );
  expect(container.innerHTML).toBe("");
});
