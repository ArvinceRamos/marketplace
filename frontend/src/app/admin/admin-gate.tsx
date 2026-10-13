"use client";

import type { ReactNode } from "react";
import { LoadError } from "@/components/ui/load-error";

/** Shared loading / not-allowed / error states for moderator pages. */
export function AdminGate({
  loading,
  forbidden,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  forbidden: boolean;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (forbidden) {
    return (
      <p role="status" className="text-body">
        Only moderators can open this page.
      </p>
    );
  }
  if (error) return <LoadError message={error} onRetry={onRetry} />;
  if (loading) {
    return <div aria-busy="true" aria-label="Loading" className="h-40 animate-pulse rounded-md bg-ink-100" />;
  }
  return <>{children}</>;
}
