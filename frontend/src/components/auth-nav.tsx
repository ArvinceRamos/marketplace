"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type State = "loading" | "guest" | "user";

export function AuthNav() {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setState(data.session ? "user" : "guest"));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setState(session ? "user" : "guest"),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (state === "loading") return <div className="h-11 w-36" aria-hidden />;
  if (state === "guest") {
    return (
      <nav aria-label="Account" className="flex items-center gap-2">
        <ButtonLink href="/login" variant="ghost">
          Log in
        </ButtonLink>
        <ButtonLink href="/register">Register</ButtonLink>
      </nav>
    );
  }
  return (
    <nav aria-label="Account" className="flex items-center gap-2">
      <ButtonLink href="/profile" variant="ghost">
        Profile
      </ButtonLink>
      <Button variant="ghost" onClick={signOut}>
        Log out
      </Button>
    </nav>
  );
}
