"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

type SessionState = "loading" | "guest" | "user";

type Favorites = {
  /** null until loaded (or for guests). */
  ids: Set<string> | null;
  toggle: (listingId: string) => Promise<void>;
};

const SessionContext = createContext<SessionState>("loading");
const FavoritesContext = createContext<Favorites>({ ids: null, toggle: async () => {} });

export const useSession = () => useContext(SessionContext);
export const useFavorites = () => useContext(FavoritesContext);

/** Sign-in state and saved listing IDs, shared by the header, hearts, and listing page. */
export function Providers({ children }: { children: ReactNode }) {
  // undefined = still checking; null = guest.
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  // Saved IDs are tagged with their owner, so a different user never sees them.
  const [saved, setSaved] = useState<{ owner: string; ids: Set<string> } | null>(null);
  const session: SessionState = userId === undefined ? "loading" : userId ? "user" : "guest";

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setUserId(s?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    apiFetch<string[]>("/me/favorite-ids")
      .then((list) => active && setSaved({ owner: userId, ids: new Set(list) }))
      .catch(() => active && setSaved({ owner: userId, ids: new Set() }));
    return () => {
      active = false;
    };
  }, [userId]);

  const ids = userId && saved?.owner === userId ? saved.ids : null;

  const toggle = useCallback(
    async (listingId: string) => {
      if (!userId) return;
      const wasSaved = ids?.has(listingId) ?? false;
      const flip = (on: boolean) =>
        setSaved((current) => {
          const next = new Set(current?.owner === userId ? current.ids : []);
          if (on) next.add(listingId);
          else next.delete(listingId);
          return { owner: userId, ids: next };
        });
      flip(!wasSaved); // update at once; undo if the server says no
      try {
        await apiFetch(`/listings/${listingId}/favorite`, { method: wasSaved ? "DELETE" : "PUT" });
      } catch (e) {
        flip(wasSaved);
        throw e;
      }
    },
    [ids, userId],
  );

  return (
    <SessionContext.Provider value={session}>
      <FavoritesContext.Provider value={{ ids, toggle }}>{children}</FavoritesContext.Provider>
    </SessionContext.Provider>
  );
}
