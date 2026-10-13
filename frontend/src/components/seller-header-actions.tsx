"use client";

import { FollowButton } from "@/components/follow-button";
import { UserSafetyMenu } from "@/components/safety/user-safety-menu";
import { ShareButton } from "@/components/share-button";
import { ButtonLink } from "@/components/ui/button";
import { useMe } from "@/lib/use-me";

/** "This is your public profile" bar, shown only to the profile's owner. */
export function SelfProfileBar({ username }: { username: string }) {
  const me = useMe();
  if (me?.username !== username) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-accent-soft px-4 py-3">
      <p className="min-w-44 flex-1 text-small text-brand-800">
        <span className="font-medium">This is your public profile.</span> Buyers see exactly this.
      </p>
      <ButtonLink href="/profile/edit" variant="secondary">
        Edit profile
      </ButtonLink>
    </div>
  );
}

/** Follow (full width on phones), Share, and the ••• safety menu. Hidden on your own profile. */
export function SellerHeaderActions({
  username,
  name,
  followers,
}: {
  username: string;
  name: string;
  followers: number;
}) {
  const me = useMe();
  if (me?.username === username) return null;
  return (
    <div className="flex w-full items-start gap-2 sm:w-auto">
      <div className="flex-1 sm:flex-none">
        <FollowButton username={username} followers={followers} showCount={false} fullWidth />
      </div>
      <ShareButton path={`/seller/${username}`} title={`${name} on Marketplace`} label="Share profile" />
      <UserSafetyMenu username={username} name={name} />
    </div>
  );
}
