import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { OrderView } from "./order-view";

export const metadata: Metadata = { title: "Order · Marketplace", robots: { index: false } };

type Props = PageProps<"/orders/[id]">;

export default function OrderPage({ params }: Props) {
  return (
    <main className="flex-1">
      <Container width="narrow" className="section-y">
        <Suspense fallback={<p aria-busy="true">Loading order…</p>}>
          <Loader params={params} />
        </Suspense>
      </Container>
    </main>
  );
}

async function Loader({ params }: Pick<Props, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <OrderView key={id} id={id} />;
}
