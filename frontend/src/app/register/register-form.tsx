"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, TextField } from "@/components/ui/field";
import { authErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

type Errors = Partial<Record<"email" | "password" | "age", string>>;

export function validateRegistration(email: string, password: string, ageConfirmed: boolean) {
  const errors: Errors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < 8) errors.password = "Use at least 8 characters.";
  if (!ageConfirmed) errors.age = "You must be 18 or older to create an account.";
  return errors;
}

export function RegisterForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const ageConfirmed = form.get("age_confirmed") === "on";

    const found = validateRegistration(email, password, ageConfirmed);
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      // The database refuses email sign-ups without this (see SECURITY_PLAN.md).
      options: { data: { age_confirmed: true } },
    });
    if (error) {
      setAlert(authErrorMessage(error));
      setPending(false);
      return;
    }
    if (data.session) {
      router.replace("/profile/edit");
      router.refresh();
    } else {
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <p role="status" className="rounded-sm bg-accent-soft px-3 py-3 text-small text-brand-900">
        Check your email for a confirmation link, then log in.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={alert} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={errors.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters."
        error={errors.password}
      />
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-center gap-3 text-small text-fg">
          <input
            type="checkbox"
            name="age_confirmed"
            required
            aria-invalid={errors.age ? true : undefined}
            aria-describedby={errors.age ? "age-error" : undefined}
            className="size-5 shrink-0 accent-accent"
          />
          <span>I am 18 years old or older.</span>
        </label>
        {errors.age && (
          <p id="age-error" className="text-caption text-danger">
            {errors.age}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
