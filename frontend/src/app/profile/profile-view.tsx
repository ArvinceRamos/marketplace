"use client";

import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api";
import type { Me } from "@/lib/profile";

export function ProfileView() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<Me>("/me")
      .then((data) => active && setMe(data))
      .catch((e: unknown) => active && setError(e instanceof ApiError ? e.message : "Could not load your profile."));
    return () => {
      active = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <FormAlert message={error} />
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!me) {
    return (
      <div aria-busy="true" aria-label="Loading profile" className="flex flex-col gap-3">
        <div className="h-6 w-40 animate-pulse rounded-sm bg-ink-100" />
        <div className="h-4 w-64 animate-pulse rounded-sm bg-ink-100" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-y-1 text-small sm:grid-cols-[8rem_1fr] sm:gap-x-4 sm:gap-y-3">
        <dt className="text-fg-muted">Username</dt>
        <dd className="mb-2 font-medium sm:mb-0">@{me.username}</dd>
        <dt className="text-fg-muted">Display name</dt>
        <dd className="mb-2 sm:mb-0">{me.display_name ?? <span className="text-fg-subtle">Not set</span>}</dd>
        <dt className="text-fg-muted">Email</dt>
        <dd className="mb-2 sm:mb-0">{me.email}</dd>
        <dt className="text-fg-muted">Bio</dt>
        <dd className="mb-2 whitespace-pre-line sm:mb-0">
          {me.bio || <span className="text-fg-subtle">Not set</span>}
        </dd>
        <dt className="text-fg-muted">Joined</dt>
        <dd className="mb-2 sm:mb-0">{new Date(me.created_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/profile/edit">Edit profile</ButtonLink>
        <ButtonLink href="/my-listings" variant="secondary">
          My listings
        </ButtonLink>
        <SignOutButton variant="secondary" />
      </div>
    </div>
  );
}
