import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
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
