"use client";

import { useEffect, useRef, useState } from "react";
import { env } from "@/lib/env";
import { usePolling } from "@/lib/use-polling";

export const CHECK_EVERY_MS = 5_000;
// Render's free plan takes about a minute to wake; allow twice that.
export const GIVE_UP_AFTER_MS = 120_000;
// A page that fails again soon after an automatic retry has a different problem.
const AUTO_RETRY_GAP_MS = 30_000;

let lastAutoRetry = -Infinity;

/** True when the API answers and can reach the database. */
export async function serverReady(): Promise<boolean> {
  try {
    const res = await fetch(`${env.apiBaseUrl}/api/v1/health/ready`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * After a page fails to load, check the API until it is ready, then call `retry`
 * once. "waking" while checking; "failed" when the server stays down or the page
 * fails again right after an automatic retry.
 */
export function useServerWake(retry: () => void): "waking" | "failed" {
  const [state, setState] = useState<"waking" | "failed">("waking");
  const startedAt = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  usePolling(
    async () => {
      if (busy.current) return; // a slow check is still running
      busy.current = true;
      try {
        const ready = await serverReady();
        const now = Date.now();
        if (ready && now - lastAutoRetry > AUTO_RETRY_GAP_MS) {
          lastAutoRetry = now;
          retry();
        } else if (ready || now - startedAt.current > GIVE_UP_AFTER_MS) {
          setState("failed");
        }
      } finally {
        busy.current = false;
      }
    },
    CHECK_EVERY_MS,
    state === "waking",
  );

  return state;
}

/** Tests only: forget the last automatic retry. */
export function resetAutoRetryForTests() {
  lastAutoRetry = -Infinity;
}
