import { expect, test } from "vitest";
import { safeNext } from "./safe-next";

test.each([
  ["/profile", "/profile"],
  ["/listing/abc?x=1", "/listing/abc?x=1"],
])("keeps same-site path %s", (input, expected) => {
  expect(safeNext(input)).toBe(expected);
});

test.each([
  null,
  "",
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "javascript:alert(1)",
  "profile",
])("rejects %s", (input) => {
  expect(safeNext(input)).toBe("/");
});
