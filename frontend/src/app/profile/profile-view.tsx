"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import { AccountShortcuts } from "@/components/account-nav";
import { Avatar } from "@/components/catalog/avatar";
import { ListingCard } from "@/components/catalog/listing-card";
import { ProfileStats } from "@/components/profile-stats";
import { ButtonLink } from "@/components/ui/button";
import { LoadError } from "@/components/ui/load-error";
import { TextLink } from "@/components/ui/text-link";
import { ApiError, apiFetch } from "@/lib/api";
import type { ListingPage, PublicProfile } from "@/lib/catalog-types";
import type { Me } from "@/lib/profile";

type Data = { me: Me; profile: PublicProfile; listings: ListingPage };

/** Your profile as buyers see it, plus owner actions and account shortcuts. */
export function ProfileView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const me = await apiFetch<Me>("/me");
      const [profile, listings] = await Promise.all([
        apiFetch<PublicProfile>(`/profiles/${encodeURIComponent(me.username)}`),
        apiFetch<ListingPage>("/me/listings?status=active&page_size=4"),
      ]);
      if (active) setData({ me, profile, listings });
    })().catch((e: unknown) => active && setError(e instanceof ApiError ? e.message : "Could not load your profile."));
    return () => {
      active = false;
    };
  }, [attempt]);

  // Pages stay mounted (hidden) after navigation. Drop account data when hidden,
  // so it isn't kept around after logging out on a shared device.
  useLayoutEffect(
    () => () => {
      setData(null);
      setError(null);
    },
    [],
  );

  if (error) {
    return (
      <LoadError
        message={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!data) return <ProfileSkeleton />;

  const { me, profile, listings } = data;
  const name = me.display_name ?? me.username;
  const city = profile.city?.name;
  const todo = [
    !me.avatar_url && { label: "Add a profile photo", href: "/profile/edit#avatar" },
    !me.city_id && { label: "Add your city", href: "/profile/edit#field-city_id" },
    !me.bio && { label: "Write a short bio", href: "/profile/edit#field-bio" },
  ].filter((t): t is { label: string; href: string } => Boolean(t));

  return (
    <div className="flex flex-col gap-6">
      {todo.length > 0 && (
        <section aria-labelledby="finish-heading" className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="finish-heading" className="text-title font-semibold">
              Finish your profile
            </h2>
            <span className="text-caption text-fg-muted" data-numeric>
              {3 - todo.length} of 3 done
            </span>
          </div>
          <p className="text-small text-fg-muted">
            Buyers check the seller before they chat. A photo and city help them decide.
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {todo.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="flex min-h-11 items-center gap-3 text-small font-medium hover:text-accent">
                  <span aria-hidden className="size-4 shrink-0 rounded-full border border-border-strong" />
                  <span className="flex-1">{t.label}</span>
                  <svg viewBox="0 0 24 24" aria-hidden className="size-5 text-fg-subtle" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar name={name} url={me.avatar_url} size={64} />
          <div className="min-w-0">
            <h1 className="truncate text-heading font-semibold">{name}</h1>
            <p className="text-small text-fg-muted">{[`@${me.username}`, city].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <ButtonLink href="/profile/edit">Edit profile</ButtonLink>
          <ButtonLink href={`/seller/${me.username}`} variant="secondary">
            View public profile
          </ButtonLink>
        </div>
      </section>

      {me.bio && <p className="max-w-prose text-body whitespace-pre-line text-pretty">{me.bio}</p>}
      <p className="flex flex-wrap gap-x-2 text-small">
        <span className="font-medium">{me.email}</span>
        <span className="text-fg-muted">Only you can see your email.</span>
      </p>

      <ProfileStats profile={profile} />

      <AccountShortcuts activeListings={listings.total} />

      {listings.items.length > 0 && (
        <section aria-labelledby="mine-heading" className="hidden flex-col gap-4 lg:flex">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="mine-heading" className="text-title font-semibold">
              Your active listings{" "}
              <span className="font-regular text-fg-muted" data-numeric>
                {listings.total}
              </span>
            </h2>
            <TextLink href="/my-listings" className="text-small font-medium">
              Manage listings
            </TextLink>
          </div>
          <ul className="grid grid-cols-4 gap-x-4 gap-y-6">
            {listings.items.map((card) => (
              <li key={card.id}>
                <ListingCard listing={card} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading profile" className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="size-16 animate-pulse rounded-full bg-ink-100" />
        <div className="flex flex-col gap-2">
          <div className="h-6 w-40 animate-pulse rounded-sm bg-ink-100" />
          <div className="h-4 w-28 animate-pulse rounded-sm bg-ink-50" />
        </div>
      </div>
      <div className="h-11 w-full max-w-sm animate-pulse rounded-sm bg-ink-100" />
      <div className="h-20 w-full max-w-2xl animate-pulse rounded-md bg-ink-50" />
    </div>
  );
}
