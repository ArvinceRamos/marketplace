import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { SiteFooter } from "./site-footer";

afterEach(cleanup);

test("links to the safety, terms, and privacy pages", () => {
  render(<SiteFooter />);
  const nav = screen.getByRole("navigation", { name: "Site information" });
  const hrefs = [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  expect(hrefs).toEqual(["/safety", "/terms", "/privacy"]);
});
