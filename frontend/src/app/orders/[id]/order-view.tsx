"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useState } from "react";
import { DisputePanel } from "@/components/orders/dispute-panel";
import { HandoverForm } from "@/components/orders/handover-form";
import { ReviewForm } from "@/components/orders/review-form";
import { Stars } from "@/components/orders/stars";
import { TestModeNotice } from "@/components/orders/test-mode-notice";
import { Tracking } from "@/components/orders/tracking";
import { Button, ButtonLink, type ButtonVariant } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormAlert } from "@/components/ui/field";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import { COURIER_LABELS } from "@/lib/deal-options";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  FULFILMENT_LABELS,
  ORDER_PAYMENT_LABELS,
  ORDER_STATUS_LABELS,
  currentDeadline,
  formatMoney,
  nextStep,
  type OrderDetail,
  type OrderReview,
} from "@/lib/orders";
import { personName } from "@/lib/social";
import { usePolling } from "@/lib/use-polling";

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

const OPEN = new Set(["pending_payment", "confirmed", "shipped", "delivered", "disputed"]);

/** Actions that are one POST, optionally after a confirmation. */
type SimpleAction = {
  label: string;
  url: (id: string) => string;
  variant?: ButtonVariant;
  demo?: boolean;
  body?: unknown;
  confirm?: (o: OrderDetail) => { title: string; body: string; action: string; variant?: ButtonVariant };
};

export const SIMPLE_ACTIONS: Record<string, SimpleAction> = {
  ship: {
    label: "Mark as shipped",
    url: (id) => `/orders/${id}/ship`,
    confirm: (o) => ({
      title: "Mark as shipped?",
      body: `A demo waybill for ${o.courier ? COURIER_LABELS[o.courier] : "the courier"} is created. In real life you would now drop the parcel off.`,
      action: "Mark as shipped",
    }),
  },
  confirm_received: {
    label: "Everything is OK",
    url: (id) => `/orders/${id}/confirm-received`,
    confirm: (o) => ({
      title: "Got the item and it's as described?",
      body: `This releases ${formatMoney(o.item_price_centavos)} to the seller and completes the order. You can't report a problem afterwards.`,
      action: "Yes, everything is OK",
    }),
  },
  new_code: {
    label: "Make a new code",
    url: (id) => `/orders/${id}/handover-code`,
    variant: "secondary",
    confirm: () => ({
      title: "Make a new handover code?",
      body: "Your old code stops working. Use this if you shared it too early or the seller got locked out.",
      action: "Make a new code",
    }),
  },
  dispute_refund: {
    label: "Refund the buyer",
    url: (id) => `/orders/${id}/dispute/refund`,
    body: {},
    confirm: (o) => ({
      title: "Refund the buyer in full?",
      body: `${formatMoney(o.total_centavos)} goes back to the buyer and the order ends. There are no returns in this demo.`,
      action: "Refund",
      variant: "danger",
    }),
  },
  dispute_withdraw: {
    label: "Problem solved",
    url: (id) => `/orders/${id}/dispute/withdraw`,
    variant: "secondary",
    confirm: (o) =>
      o.dispute?.opened_by === "seller"
        ? {
            title: "You have the item?",
            body: `This releases ${formatMoney(o.item_price_centavos)} to the seller and completes the order.`,
            action: "Yes, I have it",
          }
        : {
            title: "Withdraw your report?",
            body: `This releases ${formatMoney(o.item_price_centavos)} to the seller and completes the order.`,
            action: "Withdraw report",
          },
  },
  dispute_escalate: {
    label: "Ask a moderator",
    url: (id) => `/orders/${id}/dispute/escalate`,
    variant: "secondary",
    confirm: () => ({
      title: "Ask a moderator to decide?",
      body: "A moderator will look at the order and decide: refund you, or release the money to the seller. Their decision is final.",
      action: "Ask a moderator",
    }),
  },
  cancel: {
    label: "Cancel order",
    url: (id) => `/orders/${id}/cancel`,
    variant: "secondary",
    confirm: () => ({
      title: "Cancel this order?",
      body: "The item goes back on sale. If the order was paid, the buyer gets the full amount back.",
      action: "Cancel order",
      variant: "danger",
    }),
  },
  advance_tracking: {
    label: "Advance tracking",
    url: (id) => `/mock-courier/orders/${id}/advance`,
    variant: "secondary",
    demo: true,
  },
  fast_forward: {
    label: "Skip ahead",
    url: (id) => `/demo/orders/${id}/fast-forward`,
    variant: "secondary",
    demo: true,
    confirm: (o) => ({
      title: "Skip to the deadline?",
      body: `Test mode: acts as if "${currentDeadline(o)?.label ?? "the deadline"}" has passed, so the automatic step happens now (cancel, refund, or release).`,
      action: "Skip ahead",
    }),
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

  /** POST and show the fresh order; returns an error message or null. */
  async function post(action: string, url: string, body?: unknown): Promise<string | null> {
    setBusy(action);
    setError(null);
    try {
      setOrder(
        await apiFetch<OrderDetail>(url, {
          method: "POST",
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
      return null;
    } catch (e) {
      const message = errorText(e, "That didn't work. Try again.");
      void load();
      return message;
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  async function runSimple(action: string) {
    const spec = SIMPLE_ACTIONS[action];
    const problem = await post(action, spec.url(id), spec.body);
    setError(problem);
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
  const confirmSpec = confirming ? SIMPLE_ACTIONS[confirming] : null;
  const confirmText = confirmSpec?.confirm?.(order);
  const main = order.actions.filter((a) => SIMPLE_ACTIONS[a] && !SIMPLE_ACTIONS[a].demo);
  const demo = order.actions.filter((a) => SIMPLE_ACTIONS[a]?.demo);
  const other = personName(order.other_user);

  const actionButton = (a: string) => {
    const spec = SIMPLE_ACTIONS[a];
    return (
      <Button
        key={a}
        variant={spec.variant}
        size={spec.demo ? "sm" : "lg"}
        disabled={busy !== null}
        onClick={() => (spec.confirm ? setConfirming(a) : runSimple(a))}
      >
        {busy === a
          ? "Working…"
          : a === "dispute_withdraw" && order.dispute?.opened_by === "seller"
            ? "I have the item"
            : spec.label}
      </Button>
    );
  };

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
            {order.role === "buying" ? "Seller" : "Buyer"}:{" "}
            {order.other_user ? (
              <Link href={`/seller/${order.other_user.username}`} className="hover:underline">
                {other}
              </Link>
            ) : (
              other
            )}
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
            Give this to the seller only after you have checked the item and are happy with it.
            Entering it completes the order
            {order.payment_method === "online" ? " and releases your payment" : ""}. You can&rsquo;t
            report a problem after a meetup.
            {order.payment_method === "online" &&
              order.status === "confirmed" &&
              " Paid meetups can only be cancelled by the seller, so ask them in chat if plans change."}
          </p>
        </section>
      )}

      {order.actions.includes("handover") && (
        <HandoverForm onSubmit={(code) => post("handover", `/orders/${id}/handover`, { code })} />
      )}

      {(order.actions.includes("pay") || main.length > 0) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {order.actions.includes("pay") && (
            <Button onClick={pay} disabled={busy !== null} size="lg">
              {busy === "pay" ? "Opening MockPay…" : `Pay ${formatMoney(order.total_centavos)}`}
            </Button>
          )}
          {main.map(actionButton)}
        </div>
      )}
      <FormAlert message={error} />

      <DisputePanel order={order} post={post} />

      {order.shipment && <Tracking shipment={order.shipment} />}

      {demo.length > 0 && (
        <section
          aria-labelledby="demo-heading"
          className="flex flex-col gap-2 rounded-md border-2 border-dashed border-warning p-4"
        >
          <h2 id="demo-heading" className="text-small font-semibold">
            Test-mode tools
          </h2>
          <p className="text-caption text-fg-muted">
            Stand-ins for the courier and the clock, so you can try every step without waiting.
          </p>
          <div className="flex flex-wrap gap-2">{demo.map(actionButton)}</div>
        </section>
      )}

      {(order.status === "completed" || order.my_review) && (
        <section aria-labelledby="reviews-heading" className="flex flex-col gap-3">
          <h2 id="reviews-heading" className="text-title">
            Reviews
          </h2>
          {order.actions.includes("review") && (
            <ReviewForm
              otherName={other}
              onSubmit={(rating, comment) =>
                post("review", `/orders/${id}/review`, { rating, comment: comment || null })
              }
            />
          )}
          {order.my_review && <ReviewCard heading="Your review" review={order.my_review} />}
          {order.their_review ? (
            <ReviewCard heading={`${other}'s review of you`} review={order.their_review} />
          ) : (
            order.my_review && (
              <p className="text-caption text-fg-muted">
                {other}&rsquo;s review shows here once they post it (reviews stay hidden until both
                sides review, or 14 days pass).
              </p>
            )
          )}
          {order.review_until && order.actions.includes("review") && (
            <p className="text-caption text-fg-muted">
              You can review until {formatDate(order.review_until)}.
            </p>
          )}
        </section>
      )}

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
        {order.role === "selling" && order.payment_method !== "cash" && (
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
          {(
            [
              ["Placed", order.created_at],
              ["Paid", order.paid_at],
              ["Shipped", order.shipped_at],
              ["Delivered", order.delivered_at],
              ["Completed", order.completed_at],
              ["Cancelled", order.cancelled_at],
              ["Refunded", order.refunded_at],
            ] as const
          )
            .filter(([, at]) => at)
            .map(([label, at]) => (
              <div key={label} className="contents">
                <dt className="text-fg-muted">{label}</dt>
                <dd>{formatDateTime(at!)}</dd>
              </div>
            ))}
        </dl>
      </section>

      {order.payment_method !== "cash" && <TestModeNotice />}

      {/* Always mounted (like other pages): the dialog closes itself when unmounted. */}
      <ConfirmDialog
        open={Boolean(confirmText)}
        title={confirmText?.title ?? "Confirm"}
        body={confirmText?.body ?? ""}
        action={confirmText?.action ?? "Confirm"}
        variant={confirmText?.variant}
        pending={busy !== null}
        onConfirm={() => confirming && runSimple(confirming)}
        onClose={() => setConfirming(null)}
      />
    </div>
  );
}

function ReviewCard({ heading, review }: { heading: string; review: OrderReview }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-muted p-3">
      <p className="text-caption text-fg-muted">
        {heading} · {formatDate(review.created_at)}
      </p>
      <Stars rating={review.rating} />
      {review.comment && <p className="text-small">{review.comment}</p>}
    </div>
  );
}
