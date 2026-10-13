"use client";

// Moderator screens (Phase 12). The API checks the signed admin role on every call.
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { Condition } from "@/lib/catalog-types";
import { ApiError, apiFetch } from "@/lib/api";
import type { Dispute } from "@/lib/orders";
import type { Person } from "@/lib/social";

export type AdminSummary = {
  open_reports: number;
  open_disputes: number;
  escalated_disputes: number;
  restricted_users: number;
  hidden_listings: number;
  open_orders: number;
};

export type AdminReport = {
  id: string;
  status: "open" | "reviewing" | "actioned" | "dismissed";
  reason: string;
  details: string | null;
  created_at: string;
  reporter: Person | null;
  target_type: "listing" | "user";
  listing: { id: string; title: string; status: string; hidden: boolean; seller_username: string | null } | null;
  user: { username: string; display_name: string | null; restricted: boolean } | null;
};

export type AdminUser = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
  restricted_at: string | null;
  active_listings: number;
  open_reports: number;
};

export type AdminDispute = Dispute & {
  order: {
    id: string;
    title: string;
    status: string;
    fulfilment: string;
    item_price_centavos: number;
    total_centavos: number;
    buyer: string | null;
    seller: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    /** What the listing said when it was bought (null for older orders). */
    description: string | null;
    condition: Condition | null;
  };
};

export type AdminAction = {
  id: number;
  admin: Person | null;
  action: string;
  target_type: string;
  target_id: string | null;
  note: string | null;
  created_at: string;
};

export const ACTION_LABELS: Record<string, string> = {
  listing_hidden: "Hid a listing",
  listing_shown: "Showed a listing again",
  user_restricted: "Restricted a user",
  user_unrestricted: "Lifted a restriction",
  report_reviewing: "Marked a report as reviewing",
  report_actioned: "Actioned a report",
  report_dismissed: "Dismissed a report",
  dispute_refund_buyer: "Refunded a buyer",
  dispute_release_seller: "Released money to a seller",
};

export const errorText = (e: unknown, fallback: string) =>
  e instanceof ApiError ? e.message : fallback;

/**
 * Load an admin endpoint. `forbidden` is true for a 403 (not a moderator).
 * Data is dropped when the page is hidden, like other account pages.
 */
export function useAdminData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<T>(path)
      .then((d) => {
        if (!active) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 403) setForbidden(true);
        else setError(errorText(e, "Could not load this page."));
      });
    return () => {
      active = false;
    };
  }, [path, attempt]);

  useLayoutEffect(() => () => setData(null), []);

  const reload = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);
  return { data, setData, error, forbidden, reload };
}
