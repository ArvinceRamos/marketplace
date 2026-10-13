import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LoadError } from "./load-error";

afterEach(cleanup);

test("shows the reason and retries on click", () => {
  const onRetry = vi.fn();
  render(<LoadError message="Could not load your listings." onRetry={onRetry} />);
  expect(screen.getByRole("alert").textContent).toBe("Could not load your listings.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
});
