"use client";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";

/** A page section that failed to load: the reason plus a way to try again without reloading. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <FormAlert message={message} />
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
