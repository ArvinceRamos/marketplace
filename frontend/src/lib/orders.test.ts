import { describe, expect, test } from "vitest";
import {
  currentDeadline,
  defaultTerms,
  formatMoney,
  formatSigned,
  nextStep,
  pesosToCentavos,
  ratingLine,
  type CheckoutOptions,
  type OrderDetail,
} from "./orders";

const order = (over: Partial<OrderDetail>): OrderDetail => ({
  id: "o1",
  role: "buying",
  status: "confirmed",
  title: "Phone",
  cover_thumb_url: null,
  listing_id: "l1",
  other_user: null,
  fulfilment: "meetup",
  payment_method: "online",
  total_centavos: 1_051_500,
  created_at: "2026-10-13T00:00:00Z",
  updated_at: "2026-10-13T00:00:00Z",
  courier: null,
  item_price_centavos: 1_000_000,
  shipping_fee_centavos: 0,
  buyer_fee_centavos: 51_500,
  offer_id: null,
  cancel_reason: null,
  payment_status: "succeeded",
  paid_at: "2026-10-13T00:00:00Z",
  shipped_at: null,
  delivered_at: null,
  completed_at: null,
  cancelled_at: null,
  refunded_at: null,
  payment_due_at: null,
  ship_by: null,
  meet_by: "2026-10-20T00:00:00Z",
  confirm_by: null,
  handover_code: "123456",
  shipment: null,
  my_review: null,
  their_review: null,
  review_until: null,
  actions: ["cancel"],
  ...over,
});

test("money is always exact, including zero", () => {
  expect(formatMoney(1_051_500)).toBe("₱10,515.00");
  expect(formatMoney(0)).toBe("₱0.00");
  expect(formatSigned(-50_000)).toBe("−₱500.00");
  expect(formatSigned(50_000)).toBe("+₱500.00");
});

test("pesos typed by people become centavos", () => {
  expect(pesosToCentavos("500")).toBe(50_000);
  expect(pesosToCentavos("1,250.50")).toBe(125_050);
  expect(pesosToCentavos(" 100.5 ")).toBe(10_050);
  for (const bad of ["", "abc", "-5", "1.234", "1e3"]) expect(pesosToCentavos(bad)).toBeNull();
});

describe("next step and deadline", () => {
  test("meetup tells each side what to do with the code", () => {
    expect(nextStep(order({}))).toMatch(/give them your handover code/);
    expect(nextStep(order({ role: "selling" }))).toMatch(/Ask for their handover code/);
    expect(currentDeadline(order({}))).toEqual({ label: "Meet by", at: "2026-10-20T00:00:00Z" });
  });

  test("unpaid and cancelled orders", () => {
    const unpaid = order({ status: "pending_payment", payment_due_at: "2026-10-13T00:30:00Z" });
    expect(nextStep(unpaid)).toMatch(/Pay within 30 minutes/);
    expect(currentDeadline(unpaid)?.label).toBe("Pay by");
    const cancelled = order({ status: "cancelled", cancel_reason: "not_shipped" });
    expect(nextStep(cancelled)).toBe("The seller didn't ship within 5 days.");
    expect(currentDeadline(cancelled)).toBeNull();
  });
});

test("checkout defaults to the first deal method the seller offers", () => {
  const options: CheckoutOptions = {
    listing_id: "l1",
    title: "Phone",
    cover_thumb_url: null,
    seller: { username: "s", display_name: null, avatar_url: null },
    offer_id: null,
    item_price_centavos: 100,
    payment_methods: { delivery: ["online", "cod"] },
    couriers: [{ code: "lbc", fee_centavos: 18_000 }],
  };
  expect(defaultTerms(options)).toEqual({
    fulfilment: "delivery",
    payment_method: "online",
    courier: "lbc",
  });
  expect(defaultTerms({ ...options, payment_methods: { meetup: ["online"] } })).toEqual({
    fulfilment: "meetup",
    payment_method: "online",
    courier: undefined,
  });
});

test("rating line", () => {
  expect(ratingLine(null, 0)).toBe("No reviews yet");
  expect(ratingLine(4.5, 1)).toBe("4.5 ★ (1 review)");
  expect(ratingLine(5, 12)).toBe("5.0 ★ (12 reviews)");
});
