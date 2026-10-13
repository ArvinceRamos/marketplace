"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import { EmptyState } from "@/components/catalog/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  ORDER_STATUS_LABELS,
  formatMoney,
  type OrderPage,
  type OrderRole,
  type OrderSummary,
} from "@/lib/orders";
import { personName } from "@/lib/social";

/** Open orders first, then finished ones. */
export function OrdersView({ role }: { role: OrderRole }) {
  const [open, setOpen] = useState<OrderSummary[] | null>(null);
  const [done, setDone] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Runs again whenever this page becomes visible, so changes elsewhere show up.
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<OrderPage>(`/orders?role=${role}&state=open&page_size=48`),
      apiFetch<OrderPage>(`/orders?role=${role}&state=done&page_size=20`),
    ])
      .then(([o, d]) => {
        if (!active) return;
        setOpen(o.items);
        setDone(d.items);
      })
      .catch(
        (e: unknown) =>
          active && setError(e instanceof ApiError ? e.message : "Could not load your orders."),
      );
    return () => {
      active = false;
    };
  }, [role, attempt]);

  // Drop order data when the page is hidden (shared devices).
  useLayoutEffect(
    () => () => {
      setOpen(null);
      setDone(null);
    },
    [],
  );

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
  if (!open || !done) {
    return <div aria-busy="true" aria-label="Loading orders" className="h-40 animate-pulse rounded-md bg-ink-100" />;
  }
  if (open.length === 0 && done.length === 0) {
    return (
      <EmptyState
        title={role === "buying" ? "No orders yet" : "No sales yet"}
        body={
          role === "buying"
            ? "Tap Buy on a listing to order it with test-mode checkout."
            : "When someone buys one of your listings, it shows up here."
        }
        action={<ButtonLink href="/search">Browse listings</ButtonLink>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <OrderList heading="In progress" orders={open} empty="Nothing in progress." />
      <OrderList heading="Finished" orders={done} empty="No finished orders yet." />
    </div>
  );
}

function OrderList({
  heading,
  orders,
  empty,
}: {
  heading: string;
  orders: OrderSummary[];
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title">{heading}</h2>
      {orders.length === 0 ? (
        <p className="text-small text-fg-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center gap-3 p-3 hover:bg-ink-50">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-sm bg-ink-100">
                  {o.cover_thumb_url && (
                    <Image src={o.cover_thumb_url} alt="" fill sizes="56px" className="object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small font-medium">{o.title}</p>
                  <p className="truncate text-caption text-fg-muted">
                    {o.role === "buying" ? "From" : "To"} {personName(o.other_user)} ·{" "}
                    {formatDate(o.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-small font-semibold">{formatMoney(o.total_centavos)}</span>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-caption">
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
