import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/search" }));

const state = { session: "guest", ids: new Set<string>(), toggle: vi.fn() };
vi.mock("@/components/providers", () => ({
  useSession: () => state.session,
  useFavorites: () => ({ ids: state.ids, toggle: state.toggle }),
}));
vi.mock("@/lib/api", () => ({ ApiError: class extends Error {} }));

import { FavoriteButton } from "./favorite-button";

afterEach(() => {
  cleanup();
  push.mockReset();
  state.toggle.mockReset();
});

test("guests are sent to log in and back", () => {
  state.session = "guest";
  render(<FavoriteButton listingId="L1" title="Phone" />);
  fireEvent.click(screen.getByRole("button", { name: "Save Phone" }));
  expect(push).toHaveBeenCalledWith("/login?next=%2Fsearch");
  expect(state.toggle).not.toHaveBeenCalled();
});

test("signed-in users toggle; the state is announced", () => {
  state.session = "user";
  state.ids = new Set(["L1"]);
  render(<FavoriteButton listingId="L1" title="Phone" />);
  const button = screen.getByRole("button", { name: "Remove Phone from saved" });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button);
  expect(state.toggle).toHaveBeenCalledWith("L1");
});
