import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import Home from "./page";

afterEach(cleanup);

test("homepage shows the site heading", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Marketplace" }),
  ).toBeDefined();
});
