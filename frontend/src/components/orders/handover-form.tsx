"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";

/** Seller: type the buyer's 6-digit code at the meetup to complete the order. */
export function HandoverForm({ onSubmit }: { onSubmit: (code: string) => Promise<string | null> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("The code has 6 digits.");
      return;
    }
    setBusy(true);
    const problem = await onSubmit(code);
    setError(problem);
    if (problem) setCode("");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-md border border-border p-4" noValidate>
      <label htmlFor="handover-code" className="text-small font-medium">
        Buyer&rsquo;s handover code
      </label>
      <p id="handover-hint" className="text-caption text-fg-muted">
        Keep the item until &ldquo;Complete handover&rdquo; succeeds. Ask for the code after the
        buyer has checked the item; entering it completes the order. 5 wrong tries lock the code.
      </p>
      <div className="flex gap-2">
        <input
          id="handover-code"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          aria-describedby="handover-hint"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="min-h-11 w-36 rounded-sm border border-border-strong bg-surface px-3 font-mono text-body tracking-[0.3em] focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-accent"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Complete handover"}
        </Button>
      </div>
      <FormAlert message={error} />
    </form>
  );
}
