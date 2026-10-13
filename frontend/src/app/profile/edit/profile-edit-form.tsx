"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, TextArea, TextField } from "@/components/ui/field";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import type { Me } from "@/lib/profile";

type FieldName = "username" | "display_name" | "bio";
type Fields = Partial<Record<FieldName, string>>;

// Friendly text per field; the API's validation wording is for developers.
const FIELD_MESSAGES: Record<FieldName, string> = {
  username: "Use 3–30 lowercase letters, numbers, dots, or underscores.",
  display_name: "Use 1–50 characters.",
  bio: "Use up to 500 characters.",
};

function friendlyFields(apiFields: Record<string, string>): Fields {
  const out: Fields = {};
  for (const name of Object.keys(FIELD_MESSAGES) as FieldName[]) {
    if (apiFields[name]) out[name] = FIELD_MESSAGES[name];
  }
  return out;
}

export function ProfileEditForm() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Runs again when this page becomes visible after navigating away.
  useEffect(() => {
    let active = true;
    apiFetch<Me>("/me")
      .then((data) => active && setMe(data))
      .catch((e: unknown) => active && setAlert(e instanceof ApiError ? e.message : "Could not load your profile."));
    return () => {
      active = false;
    };
  }, [attempt]);

  // Pages stay mounted (hidden) after navigation. Reset when hidden, so account data
  // isn't kept after logging out and a finished save doesn't leave "Saving…" behind.
  useLayoutEffect(
    () => () => {
      setMe(null);
      setFields({});
      setAlert(null);
      setPending(false);
    },
    [],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("display_name") ?? "").trim();
    setPending(true);
    setFields({});
    setAlert(null);
    try {
      await apiFetch<Me>("/me", {
        method: "PATCH",
        body: JSON.stringify({
          username: String(form.get("username") ?? ""),
          display_name: displayName || null,
          bio: String(form.get("bio") ?? ""),
        }),
      });
      router.push("/profile");
    } catch (e) {
      if (e instanceof ApiError && e.code === "username_taken") {
        setFields({ username: e.message });
      } else if (e instanceof ApiError && e.fields) {
        setFields(friendlyFields(e.fields));
        setAlert("Please fix the highlighted fields.");
      } else {
        setAlert(e instanceof ApiError ? e.message : "Could not save. Please try again.");
      }
      setPending(false);
    }
  }

  if (!me) {
    if (!alert) return <p aria-busy="true">Loading…</p>;
    return (
      <LoadError
        message={alert}
        onRetry={() => {
          setAlert(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={alert} />
      <TextField
        label="Username"
        name="username"
        defaultValue={me.username}
        autoComplete="username"
        hint="3–30 characters: lowercase letters, numbers, dots, underscores."
        error={fields.username}
        required
      />
      <TextField
        label="Display name"
        name="display_name"
        defaultValue={me.display_name ?? ""}
        maxLength={50}
        error={fields.display_name}
      />
      <TextArea
        label="Bio"
        name="bio"
        defaultValue={me.bio ?? ""}
        maxLength={500}
        hint="Up to 500 characters. Don't share your phone number or address."
        error={fields.bio}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/profile")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
