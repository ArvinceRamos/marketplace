import { AuthError } from "@supabase/supabase-js";
import { expect, test } from "vitest";
import { authErrorMessage } from "./auth-errors";

test("known codes get friendly text", () => {
  const err = new AuthError("Invalid login credentials", 400, "invalid_credentials");
  expect(authErrorMessage(err)).toBe("Wrong email or password.");
});

test("unknown errors never leak internal text", () => {
  const err = new AuthError("Database error saving new user", 500, "unexpected_failure");
  expect(authErrorMessage(err)).toBe("Something went wrong. Please try again.");
});
