import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, Stack } from "@/components/ui/layout";
import type { OrderRole } from "@/lib/orders";
import { OrdersView } from "./orders-view";

export const metadata: Metadata = { title: "Orders · Marketplace", robots: { index: false } };

type Props = PageProps<"/orders">;

const TABS: { role: OrderRole; label: string }[] = [
  { role: "buying", label: "Buying" },
  { role: "selling", label: "Selling" },
];

export default function OrdersPage({ searchParams }: Props) {
  return (
    <main className="flex-1">
      <Container width="prose" className="section-y">
        <Stack gap={6}>
          <h1 className="text-heading lg:text-display">Orders</h1>
          <Suspense fallback={<p aria-busy="true">Loading…</p>}>
            <Tabs searchParams={searchParams} />
          </Suspense>
        </Stack>
      </Container>
    </main>
  );
}

async function Tabs({ searchParams }: Pick<Props, "searchParams">) {
  const query = await searchParams;
  const role: OrderRole = query.role === "selling" ? "selling" : "buying";
  return (
    <>
      <nav aria-label="Orders" className="scroll-row -mx-1 border-b border-border px-1">
        {TABS.map((tab) => {
          const current = tab.role === role;
          return (
            <Link
              key={tab.role}
              href={`/orders?role=${tab.role}`}
              aria-current={current ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-3 py-3 text-small font-medium ${
                current
                  ? "border-accent text-fg"
                  : "border-transparent text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <OrdersView key={role} role={role} />
    </>
  );
}
