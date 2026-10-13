import { expect, test } from "vitest";
import {
  STATUS_ACTIONS,
  checkPhoto,
  friendlyFields,
  parsePesos,
  pesosInput,
  readListingForm,
} from "./selling";

test("parsePesos reads pesos as exact centavos", () => {
  expect(parsePesos("1500")).toBe(150000);
  expect(parsePesos("₱1,500.5")).toBe(150050);
  expect(parsePesos(" 0.10 ")).toBe(10);
  expect(parsePesos("0")).toBe(0);
  expect(parsePesos("100000000")).toBe(10_000_000_000);
  // Floating point would turn 0.29 * 100 into 28.999…; text math does not.
  expect(parsePesos("1234.29")).toBe(123429);
});

test.each(["", "abc", "-5", "1.234", "1e5", "100000000.01", "1000000000"])(
  "parsePesos rejects %j",
  (value) => expect(parsePesos(value)).toBeNull(),
);

test("pesosInput round-trips", () => {
  for (const centavos of [0, 5, 150000, 150050, 123429]) {
    expect(parsePesos(pesosInput(centavos))).toBe(centavos);
  }
  expect(pesosInput(150005)).toBe("1500.05");
});

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

const valid = {
  title: "  Rice cooker  ",
  description: "Works",
  category_id: "12",
  city_id: "3",
  price: "750",
  condition: "well_used",
  meetup: "on",
  deal_note: "",
};

test("readListingForm builds the API body", () => {
  const { input, errors } = readListingForm(form(valid));
  expect(errors).toEqual({});
  expect(input).toEqual({
    title: "Rice cooker",
    description: "Works",
    category_id: 12,
    city_id: 3,
    price_centavos: 75000,
    condition: "well_used",
    meetup: true,
    delivery: false,
    deal_note: null,
    size: null,
    payment_methods: [],
    couriers: [],
  });
});

test("readListingForm keeps size and drops deal options that don't apply", () => {
  const data = form({ ...valid, size: "M" });
  for (const p of ["gcash", "cod", "cash", "paypal"]) data.append("payment_methods", p);
  data.append("couriers", "jnt");
  // Meetup only: COD and couriers need delivery, so they are left out.
  const { input } = readListingForm(data);
  expect([input?.size, input?.payment_methods, input?.couriers]).toEqual(["M", ["gcash", "cash"], []]);

  data.set("delivery", "on");
  expect(readListingForm(data).input?.payment_methods).toEqual(["gcash", "cod", "cash"]);
  expect(readListingForm(data).input?.couriers).toEqual(["jnt"]);
});

test("friendlyFields keeps the API's own words for size and deal options", () => {
  expect(friendlyFields({ size: "This category has no sizes.", title: "String too short" })).toEqual({
    size: "This category has no sizes.",
    title: "Use 3–80 characters.",
  });
});

test("readListingForm reports each bad field", () => {
  const { input, errors } = readListingForm(
    form({ title: "ab", category_id: "", city_id: "", price: "free", condition: "mint" }),
  );
  expect(input).toBeNull();
  expect(Object.keys(errors).sort()).toEqual(
    ["category_id", "city_id", "condition", "meetup", "price_centavos", "title"].sort(),
  );
});

test("friendlyFields keeps the API's own sentences and replaces technical ones", () => {
  expect(
    friendlyFields({
      category_id: "Choose a subcategory.",
      title: "String should have at least 3 characters",
      "body.unknown": "x",
    }),
  ).toEqual({ category_id: "Choose a subcategory.", title: "Use 3–80 characters." });
});

test("checkPhoto allows common photo types up to 8 MB", () => {
  const file = (type: string, size: number) =>
    new File([new Uint8Array(size)], "p", { type });
  expect(checkPhoto(file("image/jpeg", 1000))).toBeNull();
  expect(checkPhoto(file("", 1000))).toBeNull(); // unknown type: the server decides
  expect(checkPhoto(file("image/gif", 1000))).toMatch(/JPEG, PNG, or WebP/);
  expect(checkPhoto(file("image/png", 8 * 1024 * 1024 + 1))).toMatch(/8 MB/);
});

test("status actions match the server's allowed transitions", () => {
  const allowed = Object.fromEntries(
    Object.entries(STATUS_ACTIONS).map(([from, actions]) => [from, actions.map((a) => a.to)]),
  );
  expect(allowed).toEqual({
    draft: ["active"],
    active: ["paused", "sold"],
    paused: ["active", "sold"],
    sold: ["paused"],
  });
  // Marking sold always asks first.
  expect(STATUS_ACTIONS.active.find((a) => a.to === "sold")?.confirm).toBeDefined();
});
