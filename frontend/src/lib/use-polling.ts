"use client";

import { useEffect, useRef } from "react";

/**
 * Call `task` now and every `ms` while the browser tab is visible. Hidden tabs
 * don't poll, which keeps free-tier API and database usage low. Also stops when
 * the page is hidden by navigation (effects are cleaned up then).
 *
 * Coming back to the tab polls right away only if a full interval has passed,
 * so quickly switching tabs can't cause a burst of requests.
 */
export function usePolling(task: () => void | Promise<void>, ms: number, enabled = true) {
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRun = 0;

    const tick = () => {
      lastRun = Date.now();
      void taskRef.current();
      timer = setTimeout(tick, ms);
    };
    const start = () => {
      if (timer || document.visibilityState !== "visible") return;
      const wait = Math.max(0, lastRun + ms - Date.now());
      timer = setTimeout(tick, wait);
    };
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled]);
}
