"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/providers";
import { apiFetch } from "@/lib/api";
import type { Me } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

// One /me request per signed-in user, shared by every component on the page.
// Keyed by user ID, so a different account never sees someone else's answer.
let cached: { userId: string; me: Promise<Me> } | null = null;

async function loadMe(): Promise<Me | null> {
  const { data } = await createClient().auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return null;
  if (cached?.userId !== userId) {
    const me = apiFetch<Me>("/me");
    cached = { userId, me };
    me.catch(() => {
      if (cached?.me === me) cached = null; // let the next caller try again
    });
  }
  return cached.me;
}

/** Forget the cached profile (after editing it). */
export function forgetMe() {
  cached = null;
}

/** The signed-in user's profile: undefined while loading, null for guests or on error. */
export function useMe(): Me | null | undefined {
  const session = useSession();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    if (session !== "user") return;
    let active = true;
    loadMe()
      .then((m) => active && setMe(m))
      .catch(() => active && setMe(null));
    return () => {
      active = false;
    };
  }, [session]);
  if (session === "guest") return null;
  if (session === "loading") return undefined;
  return me;
}
