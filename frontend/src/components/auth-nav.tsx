"use client";

import { useEffect, useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { ButtonLink } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type State = "loading" | "guest" | "user";

export function AuthNav() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setState(data.session ? "user" : "guest"));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setState(session ? "user" : "guest"),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  if (state === "loading") return <div className="h-11 w-36" aria-hidden />;
  if (state === "guest") {
    return (
      <nav aria-label="Account" className="flex items-center gap-2">
        {/* Phones: no room; the sell page asks guests to log in anyway. */}
        <ButtonLink href="/sell" variant="secondary" className="max-sm:hidden">
          Sell
        </ButtonLink>
        <ButtonLink href="/login" variant="ghost">
          Log in
        </ButtonLink>
        <ButtonLink href="/register">Register</ButtonLink>
      </nav>
    );
  }
  return (
    <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
      <ButtonLink href="/sell">Sell</ButtonLink>
      {/* Phones: these two are on the profile page instead. */}
      <ButtonLink href="/my-listings" variant="ghost" className="max-sm:hidden">
        My listings
      </ButtonLink>
      <ButtonLink href="/profile" variant="ghost">
        Profile
      </ButtonLink>
      <SignOutButton className="max-sm:hidden" />
    </nav>
  );
}
