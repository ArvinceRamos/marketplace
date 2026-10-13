import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/seller/migs",
}));
const state = { session: "user" };
vi.mock("@/components/providers", () => ({ useSession: () => state.session }));

import { ApiError } from "@/lib/api";
import { ReportDialog } from "./report-dialog";
import { UserSafetyMenu } from "./user-safety-menu";

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
  push.mockReset();
  state.session = "user";
});

const target = { type: "listing", listingId: "L1", label: "Phone" } as const;

test("report needs a reason, then sends it and thanks the user", async () => {
  apiFetch.mockResolvedValue({});
  render(<ReportDialog open target={target} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect(screen.getByRole("alert").textContent).toBe("Choose a reason.");
  expect(apiFetch).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("radio", { name: /Counterfeit/ }));
  fireEvent.change(screen.getByLabelText(/Details/), { target: { value: "Fake logo" } });
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));
  await screen.findByText(/We received your report/);
  expect(apiFetch).toHaveBeenCalledWith("/reports", {
    method: "POST",
    body: JSON.stringify({
      target_type: "listing",
      listing_id: "L1",
      reason: "counterfeit",
      details: "Fake logo",
    }),
  });
});

test("a duplicate report is shown as a friendly note, not an error", async () => {
  apiFetch.mockRejectedValue(
    new (ApiError as unknown as new (s: number, c: string, m: string) => Error)(
      409,
      "already_reported",
      "You already reported this.",
    ),
  );
  render(<ReportDialog open target={target} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("radio", { name: /Scam/ }));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect((await screen.findByRole("status")).textContent).toBe("You already reported this.");
});

test("the report form starts empty each time it opens", async () => {
  const { rerender } = render(<ReportDialog open target={target} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("radio", { name: /Scam/ }));
  rerender(<ReportDialog open={false} target={target} onClose={() => {}} />);
  rerender(<ReportDialog open target={target} onClose={() => {}} />);
  await waitFor(() =>
    expect((screen.getByRole("radio", { name: /Scam/ }) as HTMLInputElement).checked).toBe(false),
  );
});

test("block asks first, then blocks by username and reports the change", async () => {
  apiFetch.mockResolvedValue(undefined);
  const onChange = vi.fn();
  render(<UserSafetyMenu username="migs" name="Miguel" blocked={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Block user" }));
  expect(apiFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Block" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
  expect(apiFetch).toHaveBeenCalledWith("/users/migs/block", { method: "PUT" });
});

test("menu is hidden on your own profile", async () => {
  apiFetch.mockImplementation((path: string) =>
    Promise.resolve(path === "/me" ? { username: "migs" } : []),
  );
  const { container } = render(<UserSafetyMenu username="migs" name="Miguel" />);
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  expect(container.innerHTML).toBe("");
});

test("guests are sent to log in before reporting", () => {
  state.session = "guest";
  render(<UserSafetyMenu username="migs" name="Miguel" />);
  fireEvent.click(screen.getByRole("button", { name: "Report user" }));
  expect(push).toHaveBeenCalledWith("/login?next=%2Fseller%2Fmigs");
});
