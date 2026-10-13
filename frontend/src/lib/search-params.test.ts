import { expect, test } from "vitest";
import { parseFilters, toQuery } from "./search-params";

test("parses valid filters and drops invalid ones", () => {
  const f = parseFilters({
    q: "  iphone  ",
    category: "mobile-phones",
    city: "Bad City!",
    min_price: "5000",
    max_price: "-3",
    condition: ["like_new", "mint"],
    sort: "price_asc",
    page: "99",
  });
  expect(f).toEqual({
    q: "iphone",
    category: "mobile-phones",
    city: undefined,
    min_price: 5000,
    max_price: undefined,
    condition: ["like_new"],
    sort: "price_asc",
    page: 1,
  });
});

test("swaps a reversed price range", () => {
  const f = parseFilters({ min_price: "900", max_price: "100" });
  expect([f.min_price, f.max_price]).toEqual([100, 900]);
});

test("relevance is the default only with a query", () => {
  expect(parseFilters({ q: "bag" }).sort).toBe("relevance");
  expect(parseFilters({ sort: "relevance" }).sort).toBe("newest");
});

test("toQuery omits defaults and round-trips", () => {
  const f = parseFilters({ q: "bag", condition: ["well_used", "like_new"], page: "2" });
  expect(toQuery(f)).toBe("?q=bag&condition=well_used&condition=like_new&page=2");
  expect(toQuery(f, { page: 1 })).toBe("?q=bag&condition=well_used&condition=like_new");
  expect(toQuery({ sort: "newest", condition: [] })).toBe("");
});
