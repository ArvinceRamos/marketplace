"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import { formatMoney, type MockPaySession } from "@/lib/orders";

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/**
 * Stands in for a payment provider's hosted checkout. It never asks for card or
 * bank details: the buttons tell MockPay which result to send to our webhook.
 */
export function MockPayView({ sessionRef }: { sessionRef: string }) {
  const router = useRouter();
  const [session, setSession] = useState<MockPaySession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<MockPaySession>(`/mock-pay/sessions/${sessionRef}`)
      .then((s) => active && setSession(s))
      .catch((e: unknown) => active && setLoadError(errorText(e, "Could not load this payment.")));
    return () => {
      active = false;
    };
  }, [sessionRef, attempt]);

  useLayoutEffect(() => () => setBusy(false), []);

  async function complete(outcome: "success" | "failure") {
    setBusy(true);
    setError(null);
    try {
      const { order_id } = await apiFetch<{ order_id: string; result: string }>(
        `/mock-pay/sessions/${sessionRef}/complete`,
        { method: "POST", body: JSON.stringify({ outcome }) },
      );
      router.push(`/orders/${order_id}`);
    } catch (e) {
      setError(errorText(e, "MockPay could not finish. Try again."));
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <LoadError
        message={loadError}
        onRetry={() => {
          setLoadError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!session) {
    return <div aria-busy="true" aria-label="Loading payment" className="h-48 animate-pulse rounded-md bg-ink-100" />;
  }

  const open = session.status === "pending";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-md border-2 border-dashed border-warning p-5">
        <p className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
          Simulated payment provider · test mode
        </p>
        <div>
          <p className="text-small text-fg-muted">Paying for</p>
          <p className="text-body font-medium">{session.title}</p>
        </div>
        <p className="text-display font-semibold">{formatMoney(session.amount_centavos)}</p>
        <p className="text-small text-fg-muted">
          No real money moves and no card or bank details are needed. Choose what the provider
          should report back to the marketplace.
        </p>
        {open ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => complete("success")} disabled={busy} size="lg">
              {busy ? "Sending…" : "Simulate successful payment"}
            </Button>
            <Button onClick={() => complete("failure")} disabled={busy} size="lg" variant="secondary">
              Simulate failed payment
            </Button>
          </div>
        ) : (
          <p role="status" className="text-small font-medium">
            This session is {session.status}. Go back to the order to pay again if needed.
          </p>
        )}
      </div>
      <FormAlert message={error} />
      <ButtonLink href={`/orders/${session.order_id}`} variant="secondary" className="self-start">
        Back to the order
      </ButtonLink>
    </div>
  );
}
