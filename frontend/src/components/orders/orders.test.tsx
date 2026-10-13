import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { OrderDetail } from "@/lib/orders";
import { DisputePanel } from "./dispute-panel";
import { HandoverForm } from "./handover-form";
import { ReviewForm } from "./review-form";
import { Tracking } from "./tracking";

afterEach(cleanup);

test("handover form only sends 6 digits and shows the server's answer", async () => {
  const onSubmit = vi.fn().mockResolvedValue("That code is not right. Check it with the buyer.");
  render(<HandoverForm onSubmit={onSubmit} />);
  const input = screen.getByLabelText("Buyer’s handover code");
  fireEvent.change(input, { target: { value: "12a34" } });
  expect((input as HTMLInputElement).value).toBe("1234"); // digits only
  fireEvent.click(screen.getByRole("button", { name: "Complete handover" }));
  expect(await screen.findByText("The code has 6 digits.")).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();

  fireEvent.change(input, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Complete handover" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("123456"));
  expect(await screen.findByText(/not right/)).toBeTruthy();
  expect((input as HTMLInputElement).value).toBe(""); // cleared for the next try
});

test("review form needs a star rating", async () => {
  const onSubmit = vi.fn().mockResolvedValue(null);
  render(<ReviewForm otherName="Miguel" onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole("button", { name: "Post review" }));
  expect(await screen.findByText("Choose 1 to 5 stars.")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("4 stars"));
  fireEvent.change(screen.getByLabelText("Comment (optional)"), { target: { value: "Nice" } });
  fireEvent.click(screen.getByRole("button", { name: "Post review" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(4, "Nice"));
});

test("tracking marks reached steps and says the waybill is a demo", () => {
  render(
    <Tracking
      shipment={{
        courier: "jnt",
        tracking_number: "DEMO-JNT-0123456789",
        status: "picked_up",
        events: [
          { status: "label_created", created_at: "2026-10-13T00:00:00Z" },
          { status: "picked_up", created_at: "2026-10-13T01:00:00Z" },
        ],
      }}
    />,
  );
  expect(screen.getByText(/DEMO-JNT-0123456789/)).toBeTruthy();
  expect(screen.getByText(/demo, not a real parcel/)).toBeTruthy();
  expect(screen.getAllByText("(not yet)")).toHaveLength(3);
});

const baseOrder = {
  id: "o1",
  role: "buying",
  status: "delivered",
  actions: ["confirm_received", "open_dispute"],
  dispute: null,
} as unknown as OrderDetail;

test("buyer reports a delivered item: only arrival problems are offered", async () => {
  const post = vi.fn().mockResolvedValue(null);
  render(<DisputePanel order={baseOrder} post={post} />);
  fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
  expect(screen.queryByLabelText("I didn't receive it")).toBeNull();
  fireEvent.click(screen.getByLabelText("Parts or items are missing"));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("open_dispute", "/orders/o1/dispute", {
      reason: "incomplete",
      details: null,
    }),
  );
});

test("seller sees the report and must explain a contest", async () => {
  const post = vi.fn().mockResolvedValue(null);
  const order = {
    ...baseOrder,
    role: "selling",
    status: "disputed",
    actions: ["dispute_refund", "dispute_contest"],
    dispute: {
      id: "d1",
      reason: "not_as_described",
      details: "Cracked screen",
      status: "open",
      opened_by: "buyer",
      respond_by: "2026-10-15T00:00:00Z",
      decide_by: null,
      seller_note: null,
      admin_note: null,
      outcome: null,
      created_at: "2026-10-13T00:00:00Z",
      resolved_at: null,
    },
  } as unknown as OrderDetail;
  render(<DisputePanel order={order} post={post} />);
  expect(screen.getByText(/Cracked screen/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Contest and ask a moderator" }));
  expect(await screen.findByText("Tell the moderator what happened.")).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});

test("seller of a paid meetup reports a buyer who took the item", async () => {
  const post = vi.fn().mockResolvedValue(null);
  const order = {
    ...baseOrder,
    role: "selling",
    status: "confirmed",
    actions: ["handover", "report_buyer", "cancel"],
  } as unknown as OrderDetail;
  render(<DisputePanel order={order} post={post} />);
  fireEvent.click(screen.getByRole("button", { name: "Buyer took the item" }));
  fireEvent.click(screen.getByRole("button", { name: "Send to a moderator" }));
  expect(await screen.findByText("Tell the moderator what happened.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("What happened?"), { target: { value: "Ran off" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to a moderator" }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("report_buyer", "/orders/o1/dispute/report-buyer", {
      note: "Ran off",
    }),
  );
});

test("handover form tells the seller to keep the item until the code works", () => {
  render(<HandoverForm onSubmit={vi.fn()} />);
  expect(screen.getByText(/Keep the item until/)).toBeTruthy();
});
