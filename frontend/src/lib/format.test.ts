import { expect, test } from "vitest";
import { formatDate, formatPrice } from "./format";

test("formats PHP prices", () => {
  expect(formatPrice(2350000)).toBe("₱23,500");
  expect(formatPrice(99950)).toBe("₱999.50");
  expect(formatPrice(0)).toBe("Free");
});

test("dates use Philippine English format", () => {
  expect(formatDate("2026-10-10T08:00:00Z")).toBe("Oct 10, 2026");
});
