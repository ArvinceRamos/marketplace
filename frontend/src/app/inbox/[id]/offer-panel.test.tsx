import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class extends Error {},
}));

import type { ConversationDetail, Offer } from "@/lib/social";
import { OfferPanel } from "./offer-panel";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
});

const pending: Offer = {
  id: "o1",
  amount_centavos: 1_400_000,
  status: "pending",
  created_at: "2026-10-13T00:00:00Z",
  expires_at: "2026-10-20T00:00:00Z",
  responded_at: null,
};

function detail(over: Partial<ConversationDetail>): ConversationDetail {
  return {
    id: "c1",
    role: "buying",
    listing: {
      id: "l1",
      title: "Phone",
      price_centavos: 1_500_000,
      status: "active",
      cover_thumb_url: null,
    },
    other_user: { username: "migs", display_name: "Miguel", avatar_url: null },
    last_message: null,
    unread_count: 0,
    latest_offer: null,
    can_message: true,
    can_offer: true,
    ...over,
  };
}

test("buyer makes an offer in pesos; it is sent as centavos", async () => {
  apiFetch.mockResolvedValue({});
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(<OfferPanel detail={detail({})} onChanged={onChanged} />);
  fireEvent.click(screen.getByRole("button", { name: "Make an offer" }));
  fireEvent.change(screen.getByLabelText(/Your offer/), { target: { value: "abc" } });
  fireEvent.click(screen.getByRole("button", { name: "Send offer" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(apiFetch).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/Your offer/), { target: { value: "14,000" } });
  fireEvent.click(screen.getByRole("button", { name: "Send offer" }));
  await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(apiFetch).toHaveBeenCalledWith("/conversations/c1/offers", {
    method: "POST",
    body: JSON.stringify({ amount_centavos: 1_400_000 }),
  });
});

test("buyer with a pending offer can only withdraw it", () => {
  render(
    <OfferPanel detail={detail({ latest_offer: pending, can_offer: false })} onChanged={vi.fn()} />,
  );
  expect(screen.getByRole("button", { name: "Withdraw" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Make an offer" })).toBeNull();
});

test("seller must confirm before accepting", async () => {
  apiFetch.mockResolvedValue({});
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(
    <OfferPanel
      detail={detail({ role: "selling", latest_offer: pending, can_offer: false })}
      onChanged={onChanged}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  expect(apiFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Accept offer", hidden: true }));
  await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/offers/o1/accept", { method: "POST" }));
});

test("nothing to do when offers are not possible", () => {
  const { container } = render(
    <OfferPanel detail={detail({ can_offer: false })} onChanged={vi.fn()} />,
  );
  expect(container.textContent).toBe("");
});
