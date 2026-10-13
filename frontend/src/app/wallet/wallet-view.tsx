"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { TestModeNotice } from "@/components/orders/test-mode-notice";
import { Button } from "@/components/ui/button";
import { FormAlert, TextField } from "@/components/ui/field";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  WALLET_KIND_LABELS,
  formatMoney,
  formatSigned,
  pesosToCentavos,
  type Wallet,
} from "@/lib/orders";

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Simulated balance from completed sales, and a pretend payout to "Demo bank". */
export function WalletView() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<Wallet>("/me/wallet")
      .then((w) => active && setWallet(w))
      .catch((e: unknown) => active && setError(errorText(e, "Could not load your wallet.")));
    return () => {
      active = false;
    };
  }, [attempt]);

  // Drop money data when the page is hidden (shared devices).
  useLayoutEffect(
    () => () => {
      setWallet(null);
      setAmount("");
      setDone(null);
    },
    [],
  );

  async function withdraw(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setDone(null);
    const centavos = pesosToCentavos(amount);
    if (centavos === null) {
      setFormError("Enter an amount in pesos, like 500 or 500.50.");
      return;
    }
    setSending(true);
    try {
      const next = await apiFetch<Wallet>("/me/wallet/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amount_centavos: centavos }),
      });
      setWallet(next);
      setAmount("");
      setDone(`${formatMoney(centavos)} sent to Demo bank (simulated).`);
    } catch (e) {
      setFormError(errorText(e, "Could not withdraw. Try again."));
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <LoadError
        message={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!wallet) {
    return <div aria-busy="true" aria-label="Loading wallet" className="h-48 animate-pulse rounded-md bg-ink-100" />;
  }

  return (
    <div className="flex flex-col gap-8">
      <TestModeNotice />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border p-4">
          <p className="text-caption text-fg-muted">Available</p>
          <p className="text-heading font-semibold">{formatMoney(wallet.available_centavos)}</p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-caption text-fg-muted">Pending (held for open sales)</p>
          <p className="text-heading font-semibold">{formatMoney(wallet.pending_centavos)}</p>
        </div>
      </div>

      <form onSubmit={withdraw} className="flex flex-col gap-3" noValidate>
        <h2 className="text-title">Withdraw</h2>
        <TextField
          label="Amount in pesos"
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint="Minimum ₱100. Goes to “Demo bank” — nothing is paid out for real, and no bank details are needed."
          error={formError ?? undefined}
        />
        <Button type="submit" disabled={sending || wallet.available_centavos < 10_000} className="self-start">
          {sending ? "Withdrawing…" : "Withdraw to Demo bank"}
        </Button>
        {done && (
          <p role="status" className="text-small text-success">
            {done}
          </p>
        )}
        <FormAlert message={null} />
      </form>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-title">
          History
        </h2>
        {wallet.entries.length === 0 ? (
          <p className="text-small text-fg-muted">
            No money movements yet. Sales show up here when an order completes.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {wallet.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-small font-medium">{WALLET_KIND_LABELS[e.kind]}</p>
                  <p className="truncate text-caption text-fg-muted">
                    {e.order_id ? (
                      <Link href={`/orders/${e.order_id}`} className="hover:underline">
                        {e.memo}
                      </Link>
                    ) : (
                      e.memo
                    )}{" "}
                    · {formatDateTime(e.created_at)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-small font-semibold ${e.amount_centavos > 0 ? "text-success" : ""}`}
                >
                  {formatSigned(e.amount_centavos)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-caption text-fg-muted">
          Payments and refunds appear here too, so buyers can see where their money went.
        </p>
      </section>
    </div>
  );
}
