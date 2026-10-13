import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/seller/joy" }));

const state = { session: "guest" };
vi.mock("@/components/providers", () => ({ useSession: () => state.session }));

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class extends Error {},
}));

import { FollowButton } from "./follow-button";

afterEach(() => {
  cleanup();
  push.mockReset();
  apiFetch.mockReset();
});

function signedIn(me: string, following: boolean) {
  state.session = "user";
  apiFetch.mockImplementation(async (path: string) => {
    if (path === "/me") return { username: me };
    if (path === "/users/joy/follow") return { following };
    throw new Error(`unexpected ${path}`);
  });
}

test("guests see the count and are sent to log in", () => {
  state.session = "guest";
  render(<FollowButton username="joy" followers={1} />);
  expect(screen.getByText("1 follower")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Follow" }));
  expect(push).toHaveBeenCalledWith("/login?next=%2Fseller%2Fjoy");
  expect(apiFetch).not.toHaveBeenCalled();
});

test("following updates the button and the count", async () => {
  signedIn("ben", false);
  render(<FollowButton username="joy" followers={2} />);
  const button = await screen.findByRole("button", { name: "Follow" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  expect(button.getAttribute("aria-pressed")).toBe("false");

  apiFetch.mockResolvedValueOnce(undefined);
  fireEvent.click(button);
  await screen.findByRole("button", { name: "Following" });
  expect(apiFetch).toHaveBeenLastCalledWith("/users/joy/follow", { method: "PUT" });
  expect(screen.getByText("3 followers")).toBeDefined();
});

test("your own profile shows only the count", async () => {
  signedIn("joy", false);
  render(<FollowButton username="joy" followers={5} />);
  await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  expect(screen.getByText("5 followers")).toBeDefined();
});
