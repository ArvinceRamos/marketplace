"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { TestModeNotice } from "@/components/orders/test-mode-notice";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import { COURIER_LABELS } from "@/lib/deal-options";
import {
  FULFILMENT_LABELS,
  ORDER_PAYMENT_HINTS,
  ORDER_PAYMENT_LABELS,
  defaultTerms,
  formatMoney,
  type CheckoutOptions,
  type Fulfilment,
  type OrderDetail,
  type OrderPayment,
  type OrderTerms,
  type Quote,
} from "@/lib/orders";
import { personName } from "@/lib/social";

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Choose how to deal and pay, see the exact total, and place the order. */
export function CheckoutView({ listingId, offerId }: { listingId: string; offerId: string | null }) {
  const router = useRouter();
  const [options, setOptions] = useState<CheckoutOptions | null>(null);
  const [terms, setTerms] = useState<Omit<OrderTerms, "listing_id"> | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const query = offerId ? `?offer_id=${offerId}` : "";
    apiFetch<CheckoutOptions>(`/listings/${listingId}/checkout${query}`)
      .then((o) => {
        if (!active) return;
        setOptions(o);
        setTerms(defaultTerms(o));
      })
      .catch((e: unknown) => active && setLoadError(errorText(e, "Could not load checkout.")));
    return () => {
      active = false;
    };
  }, [listingId, offerId, attempt]);

  // The server prices every choice; the page never adds up money itself.
  useEffect(() => {
    if (!terms) return;
    let active = true;
    const body: OrderTerms = { listing_id: listingId, ...terms };
    if (offerId) body.offer_id = offerId;
    apiFetch<Quote>("/orders/quote", { method: "POST", body: JSON.stringify(body) })
      .then((q) => active && (setQuote(q), setError(null)))
      .catch((e: unknown) => active && (setQuote(null), setError(errorText(e, "Could not price this."))));
    return () => {
      active = false;
    };
  }, [listingId, offerId, terms]);

  // Pages stay mounted when hidden; don't come back to a half-placed order.
  useLayoutEffect(() => () => setPlacing(false), []);

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
  if (!options || !terms) {
    return <div aria-busy="true" aria-label="Loading checkout" className="h-64 animate-pulse rounded-md bg-ink-100" />;
  }

  const fulfilments = (["meetup", "delivery"] as const).filter((f) => options.payment_methods[f]);
  const payments = options.payment_methods[terms.fulfilment] ?? [];

  function chooseFulfilment(f: Fulfilment) {
    setTerms({
      fulfilment: f,
      payment_method: "online",
      courier: f === "delivery" ? options!.couriers[0]?.code : undefined,
    });
  }

  async function placeOrder() {
    setPlacing(true);
    setError(null);
    const body: OrderTerms = { listing_id: listingId, ...terms! };
    if (offerId) body.offer_id = offerId;
    try {
      const order = await apiFetch<OrderDetail>("/orders", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (order.actions.includes("pay")) {
        const { checkout_url } = await apiFetch<{ checkout_url: string }>(
          `/orders/${order.id}/pay`,
          { method: "POST" },
        );
        router.push(checkout_url);
      } else {
        router.push(`/orders/${order.id}`);
      }
    } catch (e) {
      setError(errorText(e, "Could not place the order. Try again."));
      setPlacing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <TestModeNotice />
      <div className="flex items-center gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-sm bg-ink-100">
          {options.cover_thumb_url && (
            <Image src={options.cover_thumb_url} alt="" fill sizes="64px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-body font-medium">{options.title}</p>
          <p className="text-small text-fg-muted">
            Sold by {personName(options.seller)}
            {options.offer_id && " · your accepted offer"}
          </p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small font-medium">How do you want to get it?</legend>
        {fulfilments.map((f) => (
          <Choice
            key={f}
            name="fulfilment"
            checked={terms.fulfilment === f}
            onChange={() => chooseFulfilment(f)}
            label={FULFILMENT_LABELS[f]}
            hint={f === "meetup" ? "Meet the seller in a public place." : "The seller ships it to you."}
          />
        ))}
      </fieldset>

      {terms.fulfilment === "delivery" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small font-medium">Courier</legend>
          {options.couriers.map((c) => (
            <Choice
              key={c.code}
              name="courier"
              checked={terms.courier === c.code}
              onChange={() => setTerms({ ...terms, courier: c.code })}
              label={`${COURIER_LABELS[c.code]} · ${formatMoney(c.fee_centavos)}`}
            />
          ))}
          <p className="text-caption text-fg-muted">Demo flat rates, not real courier prices.</p>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-small font-medium">Payment</legend>
        {payments.map((p: OrderPayment) => (
          <Choice
            key={p}
            name="payment"
            checked={terms.payment_method === p}
            onChange={() => setTerms({ ...terms, payment_method: p })}
            label={ORDER_PAYMENT_LABELS[p]}
            hint={ORDER_PAYMENT_HINTS[p]}
          />
        ))}
      </fieldset>

      <section aria-labelledby="summary-heading" aria-live="polite" className="flex flex-col gap-2 rounded-md border border-border p-4">
        <h2 id="summary-heading" className="text-title">
          Summary
        </h2>
        {quote ? (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-small">
            <dt>Item</dt>
            <dd className="text-right">{formatMoney(quote.item_price_centavos)}</dd>
            <dt>Shipping</dt>
            <dd className="text-right">{formatMoney(quote.shipping_fee_centavos)}</dd>
            <dt>Buyer protection fee (₱15 + 5%)</dt>
            <dd className="text-right">{formatMoney(quote.buyer_fee_centavos)}</dd>
            <dt className="mt-2 border-t border-border pt-2 text-body font-semibold">Total</dt>
            <dd className="mt-2 border-t border-border pt-2 text-right text-body font-semibold">
              {formatMoney(quote.total_centavos)}
            </dd>
          </dl>
        ) : (
          <p className="text-small text-fg-muted">{error ? "—" : "Calculating…"}</p>
        )}
      </section>

      <FormAlert message={error} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button onClick={placeOrder} disabled={!quote || placing} size="lg">
          {placing
            ? "Placing order…"
            : terms.payment_method === "online"
              ? "Place order and pay"
              : "Place order"}
        </Button>
        <ButtonLink href={`/listing/${listingId}`} variant="secondary" size="lg">
          Back to listing
        </ButtonLink>
      </div>
      <p className="text-caption text-fg-muted">
        Placing an order reserves the item for you. Online orders not paid within 30 minutes are
        cancelled.
      </p>
    </div>
  );
}

function Choice({
  name,
  label,
  hint,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
        checked ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 size-4 accent-[var(--color-accent)]"
      />
      <span className="flex flex-col">
        <span className="text-small font-medium">{label}</span>
        {hint && <span className="text-caption text-fg-muted">{hint}</span>}
      </span>
    </label>
  );
}
