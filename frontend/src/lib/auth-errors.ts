import type { AuthError } from "@supabase/supabase-js";

// Plain-language messages for Supabase Auth errors. Unknown errors get a
// generic message so internal details never reach the page.
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Wrong email or password.",
  email_not_confirmed: "Please confirm your email first. Check your inbox.",
  user_already_exists: "An account with this email already exists. Try logging in.",
  email_exists: "An account with this email already exists. Try logging in.",
  weak_password: "Choose a stronger password (at least 8 characters).",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  over_email_send_rate_limit: "Too many emails sent. Wait a while and try again.",
  signup_disabled: "Sign-ups are closed right now.",
  validation_failed: "Check the email address and try again.",
};

export function authErrorMessage(error: AuthError): string {
  return (error.code && MESSAGES[error.code]) || "Something went wrong. Please try again.";
}
