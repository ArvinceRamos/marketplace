"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useState } from "react";
import { TestModeNotice } from "@/components/orders/test-mode-notice";
import { Button, ButtonLink, type ButtonVariant } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormAlert } from "@/components/ui/field";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import { COURIER_LABELS } from "@/lib/deal-options";
import { formatDateTime } from "@/lib/format";
import {
  FULFILMENT_LABELS,
  ORDER_PAYMENT_LABELS,
  ORDER_STATUS_LABELS,
  currentDeadline,
  formatMoney,
  nextStep,
  type OrderDetail,
} from "@/lib/orders";
import { personName } from "@/lib/social";
import { usePolling } from "@/lib/use-polling";

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

const OPEN = new Set(["pending_payment", "confirmed", "shipped", "delivered", "disputed"]);

/** Simple actions: one POST, optionally after a confirmation. */
type SimpleAction = {
  label: string;
  path: string;
  variant?: ButtonVariant;
  confirm?: { title: string; body: string; action: string; variant?: ButtonVariant };
};

export const SIMPLE_ACTIONS: Record<string, SimpleAction> = {
  cancel: {
    label: "Cancel order",
    path: "cancel",
    variant: "secondary",
    confirm: {
      title: "Cancel this order?",
      body: "The item goes back on sale. If the order was paid, the buyer gets the full amount back.",
      action: "Cancel order",
      variant: "danger",
    },
  },
};

export function OrderView({ id }: { id: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await apiFetch<OrderDetail>(`/orders/${id}`));
      setLoadError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setLoadError(errorText(e, "Could not load this order."));
    }
  }, [id]);

  // The other side may act at any time; check every 15 s while the order is open.
  usePolling(load, 15_000, !order || OPEN.has(order.status));

  // Drop order data (and the handover code) when the page is hidden.
  useLayoutEffect(
    () => () => {
      setOrder(null);
      setConfirming(null);
    },
    [],
  );

  async function run(action: string, path: string, body?: unknown) {
    setBusy(action);
    setError(null);
    try {
      setOrder(
        await apiFetch<OrderDetail>(`/orders/${id}/${path}`, {
          method: "POST",
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
    } catch (e) {
      setError(errorText(e, "That didn't work. Try again."));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  async function pay() {
    setBusy("pay");
    setError(null);
    try {
      const { checkout_url } = await apiFetch<{ checkout_url: string }>(`/orders/${id}/pay`, {
        method: "POST",
      });
      router.push(checkout_url);
    } catch (e) {
      setError(errorText(e, "Could not start the payment."));
      setBusy(null);
    }
  }

  if (missing) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-heading">Order not found</h1>
        <p className="text-small text-fg-muted">It may belong to another account.</p>
        <ButtonLink href="/orders">Your orders</ButtonLink>
      </div>
    );
  }
  if (loadError && !order) {
    return <LoadError message={loadError} onRetry={() => void load()} />;
  }
  if (!order) {
    return <div aria-busy="true" aria-label="Loading order" className="h-64 animate-pulse rounded-md bg-ink-100" />;
  }

  const deadline = currentDeadline(order);
  const confirmAction = confirming ? SIMPLE_ACTIONS[confirming] : null;
  const simple = order.actions.filter((a) => SIMPLE_ACTIONS[a]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/orders" className="text-small text-fg-muted hover:text-fg">
          ← Orders
        </Link>
        <h1 className="text-heading">{order.role === "buying" ? "Your order" : "Your sale"}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-sm bg-ink-100">
          {order.cover_thumb_url && (
            <Image src={order.cover_thumb_url} alt="" fill sizes="64px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0">
          {order.listing_id ? (
            <Link href={`/listing/${order.listing_id}`} className="block truncate text-body font-medium hover:underline">
              {order.title}
            </Link>
          ) : (
            <p className="truncate text-body font-medium">{order.title}</p>
          )}
          <p className="text-small text-fg-muted">
            {order.role === "buying" ? "Seller" : "Buyer"}: {personName(order.other_user)}
          </p>
        </div>
      </div>

      <section aria-live="polite" className="flex flex-col gap-2 rounded-md bg-accent-soft p-4">
        <p className="text-small font-semibold">{ORDER_STATUS_LABELS[order.status]}</p>
        <p className="text-small">{nextStep(order)}</p>
        {deadline && (
          <p className="text-caption text-fg-muted">
            {deadline.label} {formatDateTime(deadline.at)}
          </p>
        )}
      </section>

      {order.handover_code && (
        <section className="flex flex-col gap-1 rounded-md border border-border p-4">
          <h2 className="text-small font-semibold">Your handover code</h2>
          <p className="font-mono text-display tracking-[0.3em]">{order.handover_code}</p>
          <p className="text-caption text-fg-muted">
            Give this to the seller only after you have checked the item. Entering it completes the
            order{order.payment_method === "online" ? " and releases your payment" : ""}.
          </p>
        </section>
      )}

      {(order.actions.includes("pay") || simple.length > 0) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {order.actions.includes("pay") && (
            <Button onClick={pay} disabled={busy !== null} size="lg">
              {busy === "pay" ? "Opening MockPay…" : `Pay ${formatMoney(order.total_centavos)}`}
            </Button>
          )}
          {simple.map((a) => {
            const spec = SIMPLE_ACTIONS[a];
            return (
              <Button
                key={a}
                variant={spec.variant}
                size="lg"
                disabled={busy !== null}
                onClick={() => (spec.confirm ? setConfirming(a) : run(a, spec.path))}
              >
                {busy === a ? "Working…" : spec.label}
              </Button>
            );
          })}
        </div>
      )}
      <FormAlert message={error} />

      <section aria-labelledby="amounts-heading" className="flex flex-col gap-2">
        <h2 id="amounts-heading" className="text-title">
          Amounts
        </h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-small">
          <dt>Item</dt>
          <dd className="text-right">{formatMoney(order.item_price_centavos)}</dd>
          <dt>Shipping</dt>
          <dd className="text-right">{formatMoney(order.shipping_fee_centavos)}</dd>
          <dt>Buyer protection fee</dt>
          <dd className="text-right">{formatMoney(order.buyer_fee_centavos)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold">{formatMoney(order.total_centavos)}</dd>
        </dl>
        {order.role === "selling" && order.payment_method === "online" && (
          <p className="text-caption text-fg-muted">
            You receive {formatMoney(order.item_price_centavos)} in your wallet when the order
            completes. Sellers pay no fees.
          </p>
        )}
      </section>

      <section aria-labelledby="details-heading" className="flex flex-col gap-2">
        <h2 id="details-heading" className="text-title">
          Details
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
          <dt className="text-fg-muted">Deal</dt>
          <dd>
            {FULFILMENT_LABELS[order.fulfilment]}
            {order.courier && ` · ${COURIER_LABELS[order.courier]}`}
          </dd>
          <dt className="text-fg-muted">Payment</dt>
          <dd>{ORDER_PAYMENT_LABELS[order.payment_method]}</dd>
          <dt className="text-fg-muted">Placed</dt>
          <dd>{formatDateTime(order.created_at)}</dd>
          {order.paid_at && (
            <>
              <dt className="text-fg-muted">Paid</dt>
              <dd>{formatDateTime(order.paid_at)}</dd>
            </>
          )}
          {order.completed_at && (
            <>
              <dt className="text-fg-muted">Completed</dt>
              <dd>{formatDateTime(order.completed_at)}</dd>
            </>
          )}
          {order.cancelled_at && (
            <>
              <dt className="text-fg-muted">Cancelled</dt>
              <dd>{formatDateTime(order.cancelled_at)}</dd>
            </>
          )}
          {order.refunded_at && (
            <>
              <dt className="text-fg-muted">Refunded</dt>
              <dd>{formatDateTime(order.refunded_at)}</dd>
            </>
          )}
        </dl>
      </section>

      {order.payment_method === "online" && <TestModeNotice />}

      {confirmAction?.confirm && (
        <ConfirmDialog
          open
          title={confirmAction.confirm.title}
          body={confirmAction.confirm.body}
          action={confirmAction.confirm.action}
          variant={confirmAction.confirm.variant}
          pending={busy !== null}
          onConfirm={() => run(confirming!, confirmAction.path)}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
