import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class extends Error {},
}));

import { ListingActions } from "./listing-actions";
import { PhotoGrid } from "./photo-grid";

beforeAll(() => {
  // jsdom has <dialog> but not its modal methods.
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

const photos = [
  { id: "a", src: "a.webp" },
  { id: "b", src: "b.webp" },
];

test("photo grid marks the cover and offers accessible move buttons", () => {
  const onMove = vi.fn();
  const onRemove = vi.fn();
  render(
    <PhotoGrid photos={photos} onAdd={vi.fn()} onRemove={onRemove} onMove={onMove} />,
  );
  expect(screen.getByText("Cover")).toBeTruthy();
  expect(screen.getByText(/2 of 8/)).toBeTruthy();
  expect((screen.getByLabelText("Move photo 1 earlier") as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("Move photo 2 later") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Move photo 2 earlier"));
  expect(onMove).toHaveBeenCalledWith("b", -1);
  fireEvent.click(screen.getByLabelText("Remove photo 1"));
  expect(onRemove).toHaveBeenCalledWith("a");
});

test("photo grid hides the add tile when full", () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({ id: String(i), src: `${i}.webp` }));
  render(<PhotoGrid photos={eight} onAdd={vi.fn()} onRemove={vi.fn()} onMove={vi.fn()} />);
  expect(screen.queryByText("Add photos")).toBeNull();
});

test("pausing runs at once; marking sold asks first", async () => {
  apiFetch.mockResolvedValue({});
  const onDone = vi.fn();
  render(<ListingActions listingId="L1" status="active" onDone={onDone} />);

  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith("paused"));
  expect(apiFetch).toHaveBeenCalledWith("/listings/L1/status", {
    method: "POST",
    body: JSON.stringify({ status: "paused" }),
  });

  fireEvent.click(screen.getByRole("button", { name: "Mark as sold" }));
  expect(apiFetch).toHaveBeenCalledTimes(1); // nothing sent yet
  expect(screen.getByText("Mark this item as sold?")).toBeTruthy();
  const confirm = screen.getAllByRole("button", { name: "Mark as sold", hidden: true }).at(-1)!;
  fireEvent.click(confirm);
  await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith("sold"));
});

test("delete asks first and can be cancelled", () => {
  render(<ListingActions listingId="L1" status="draft" onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(screen.getByText("Delete this listing?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
  expect(apiFetch).not.toHaveBeenCalled();
});
