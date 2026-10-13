import { expect, test } from "vitest";
import type { CategoryNode } from "./catalog-types";
import { fitDealOptions, sizeLabel, sizesFor } from "./deal-options";

const tree: CategoryNode[] = [
  {
    id: 2,
    slug: "fashion",
    name: "Fashion",
    children: [
      { id: 9, slug: "shoes", name: "Shoes", sizes: ["EU 38", "EU 39"] },
      { id: 10, slug: "bags", name: "Bags", sizes: [] },
    ],
  },
];

test("sizesFor finds a subcategory by slug or id; parents have none", () => {
  expect(sizesFor(tree, "shoes")).toEqual(["EU 38", "EU 39"]);
  expect(sizesFor(tree, "9")).toEqual(["EU 38", "EU 39"]);
  expect(sizesFor(tree, "bags")).toEqual([]);
  expect(sizesFor(tree, "fashion")).toEqual([]);
  expect(sizesFor(tree, undefined)).toEqual([]);
});

test("sizeLabel adds 'Size' only where it helps", () => {
  expect(sizeLabel("M")).toBe("Size M");
  expect(sizeLabel("EU 40")).toBe("EU 40");
  expect(sizeLabel("3-4 years")).toBe("3-4 years");
  expect(sizeLabel("Free size")).toBe("Free size");
});

test("fitDealOptions follows the meetup/delivery rules", () => {
  expect(fitDealOptions(true, false, ["gcash", "cod", "cash"], ["jnt"])).toEqual({
    payments: ["gcash", "cash"],
    couriers: [],
  });
  expect(fitDealOptions(false, true, ["maya", "cod", "cash"], ["flash"])).toEqual({
    payments: ["maya", "cod"],
    couriers: ["flash"],
  });
});
