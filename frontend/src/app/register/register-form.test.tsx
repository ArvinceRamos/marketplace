import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const signUp = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { RegisterForm, validateRegistration } from "./register-form";

afterEach(() => {
  cleanup();
  signUp.mockReset();
});

test("validation requires email, 8+ char password, and 18+ confirmation", () => {
  expect(validateRegistration("bad", "short", false)).toEqual({
    email: "Enter a valid email address.",
    password: "Use at least 8 characters.",
    age: "You must be 18 or older to create an account.",
  });
  expect(validateRegistration("a@b.ph", "long-enough", true)).toEqual({});
});

test("does not call sign-up without the 18+ checkbox", () => {
  render(<RegisterForm />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.ph" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(screen.getByText("You must be 18 or older to create an account.")).toBeDefined();
  expect(signUp).not.toHaveBeenCalled();
});

test("sends the age confirmation to sign-up", async () => {
  signUp.mockResolvedValue({ data: { session: null }, error: null });
  render(<RegisterForm />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.ph" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-enough" } });
  fireEvent.click(screen.getByLabelText("I am 18 years old or older."));
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("status")).toBeDefined();
  expect(signUp).toHaveBeenCalledWith({
    email: "a@b.ph",
    password: "long-enough",
    options: { data: { age_confirmed: true } },
  });
});
